import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";

import { createOrderStatusHistory } from "./orderStatusHistory.service.js";

/*
|--------------------------------------------------------------------------
| Allowed Shipment Status Transitions
|--------------------------------------------------------------------------
|
| Shipment follows the real-world delivery lifecycle:
|
| ready
|   ↓
| shipped
|   ↓
| in_transit
|   ↓
| out_for_delivery
|   ↓
| delivered
|
| We do NOT allow users to jump directly from one stage to another.
|
| Delivery attempts and failed deliveries are handled separately
| through tracking events.
|
*/

const allowedShipmentTransitions = {
  ready: ["shipped"],
  shipped: ["in_transit"],
  in_transit: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/*
|--------------------------------------------------------------------------
| Tracking Event Helper
|--------------------------------------------------------------------------
|
| Creates a physical shipment tracking event.
|
| This helper accepts `tx` so it can run inside the same
| database transaction as shipment/order updates.
|
*/

const createTrackingEvent = async (
  tx,
  shipmentId,
  status,
  description = null,
  location = null,
) => {
  return tx.shipment_tracking_events.create({
    data: {
      shipment_id: shipmentId,
      status,
      description,
      location,
    },
  });
};

/*
|--------------------------------------------------------------------------
| Create Shipment
|--------------------------------------------------------------------------
|
| An order must:
|
| 1. Exist
| 2. Be paid
| 3. Be in "processing" status
| 4. Not already have a shipment
|
| Shipment starts with:
|
| status = ready
|
*/

export const createShipment = async (orderId, carrier, trackingNumber) => {
  const result = await prisma.$transaction(async (tx) => {
    /*
        |--------------------------------------------------------------------------
        | Lock Order
        |--------------------------------------------------------------------------
        */

    const orderRows = await tx.$queryRaw`
            SELECT
                id,
                status,
                payment_status
            FROM orders
            WHERE id = ${orderId}::uuid
            FOR UPDATE
        `;

    const order = orderRows[0];

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Payment Check
        |--------------------------------------------------------------------------
        */

    if (order.payment_status !== "paid") {
      throw new AppError("Cannot create shipment for an unpaid order", 400);
    }

    /*
        |--------------------------------------------------------------------------
        | Order Status Check
        |--------------------------------------------------------------------------
        */

    if (order.status !== "processing") {
      throw new AppError(
        "Order must be in processing status before creating a shipment",
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Prevent Duplicate Shipment
        |--------------------------------------------------------------------------
        */

    const existingShipment = await tx.shipments.findUnique({
      where: {
        order_id: order.id,
      },
    });

    if (existingShipment) {
      throw new AppError("Shipment already exists for this order", 409);
    }

    /*
        |--------------------------------------------------------------------------
        | Create Shipment
        |--------------------------------------------------------------------------
        */

    const shipment = await tx.shipments.create({
      data: {
        order_id: order.id,
        carrier,
        tracking_number: trackingNumber,
        status: "ready",
      },
    });

    /*
        |--------------------------------------------------------------------------
        | Create Initial Tracking Event
        |--------------------------------------------------------------------------
        |
        | This gives us the first event in the tracking timeline.
        |
        */

    await createTrackingEvent(
      tx,
      shipment.id,
      "ready",
      "Shipment created and ready for dispatch",
      null,
    );

    return shipment;
  });

  return result;
};

/*
|--------------------------------------------------------------------------
| Update Shipment Status
|--------------------------------------------------------------------------
|
| Moves shipment through:
|
| ready
|   ↓
| shipped
|   ↓
| in_transit
|   ↓
| out_for_delivery
|   ↓
| delivered
|
| Every status change also creates a shipment tracking event.
|
*/

export const updateShipmentStatus = async (shipmentId, newStatus) => {
  const result = await prisma.$transaction(async (tx) => {
    /*
        |--------------------------------------------------------------------------
        | Lock Shipment
        |--------------------------------------------------------------------------
        */

    const shipmentRows = await tx.$queryRaw`
            SELECT
                id,
                order_id,
                status
            FROM shipments
            WHERE id = ${shipmentId}::uuid
            FOR UPDATE
        `;

    const shipment = shipmentRows[0];

    if (!shipment) {
      throw new AppError("Shipment not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Validate Status Transition
        |--------------------------------------------------------------------------
        */

    const possibleStatuses = allowedShipmentTransitions[shipment.status] || [];

    if (!possibleStatuses.includes(newStatus)) {
      throw new AppError(
        `Cannot change shipment status from ${shipment.status} to ${newStatus}`,
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Prepare Shipment Update
        |--------------------------------------------------------------------------
        */

    const shipmentData = {
      status: newStatus,
    };

    /*
        |--------------------------------------------------------------------------
        | Record Shipping Time
        |--------------------------------------------------------------------------
        */

    if (newStatus === "shipped") {
      shipmentData.shipped_at = new Date();
    }

    /*
        |--------------------------------------------------------------------------
        | Record Out For Delivery Time
        |--------------------------------------------------------------------------
        */

    if (newStatus === "out_for_delivery") {
      shipmentData.out_for_delivery_at = new Date();
    }

    /*
        |--------------------------------------------------------------------------
        | Record Delivery Time
        |--------------------------------------------------------------------------
        */

    if (newStatus === "delivered") {
      shipmentData.delivered_at = new Date();
    }

    /*
        |--------------------------------------------------------------------------
        | Update Shipment
        |--------------------------------------------------------------------------
        */

    const updatedShipment = await tx.shipments.update({
      where: {
        id: shipment.id,
      },
      data: shipmentData,
    });

    /*
        |--------------------------------------------------------------------------
        | Create Shipment Tracking Event
        |--------------------------------------------------------------------------
        |
        | Every lifecycle transition becomes a tracking event.
        |
        */

    const trackingEventMessages = {
      shipped: "Shipment has been dispatched",
      in_transit: "Shipment is in transit",
      out_for_delivery: "Shipment is out for delivery",
      delivered: "Shipment has been delivered",
    };

    await createTrackingEvent(
      tx,
      shipment.id,
      newStatus,
      trackingEventMessages[newStatus] || null,
      null,
    );

    /*
        |--------------------------------------------------------------------------
        | Synchronize Order Status
        |--------------------------------------------------------------------------
        |
        | Shipment is the source of truth for fulfillment stages.
        |
        */

    if (newStatus === "shipped") {
      await tx.orders.update({
        where: {
          id: shipment.order_id,
        },
        data: {
          status: "shipped",
          updated_at: new Date(),
        },
      });

      await createOrderStatusHistory(tx, shipment.order_id, "shipped", null);
    }

    /*
        |--------------------------------------------------------------------------
        | Delivered
        |--------------------------------------------------------------------------
        */

    if (newStatus === "delivered") {
      await tx.orders.update({
        where: {
          id: shipment.order_id,
        },
        data: {
          status: "delivered",
          delivered_at: new Date(),
          updated_at: new Date(),
        },
      });

      await createOrderStatusHistory(
        tx,
        shipment.order_id,
        "delivered",
        null,
        "Shipment delivered",
      );
    }

    return updatedShipment;
  });

  return result;
};

/*
|--------------------------------------------------------------------------
| Add Manual Tracking Event
|--------------------------------------------------------------------------
|
| Admin can add additional logistics events that don't necessarily
| require changing the shipment's main status.
|
| Examples:
|
| "Arrived at Indore sorting facility"
| "Package delayed due to weather"
| "Delivery attempted"
|
*/

export const addTrackingEvent = async (
  shipmentId,
  status,
  description,
  location,
) => {
  /*
    |--------------------------------------------------------------------------
    | Check Shipment
    |--------------------------------------------------------------------------
    */

  const shipment = await prisma.shipments.findUnique({
    where: {
      id: shipmentId,
    },
    select: {
      id: true,
    },
  });

  if (!shipment) {
    throw new AppError("Shipment not found", 404);
  }

  /*
    |--------------------------------------------------------------------------
    | Create Tracking Event
    |--------------------------------------------------------------------------
    */

  const trackingEvent = await prisma.shipment_tracking_events.create({
    data: {
      shipment_id: shipment.id,
      status,
      description: description || null,
      location: location || null,
    },
  });

  return trackingEvent;
};

/*
|--------------------------------------------------------------------------
| Record Delivery Attempt
|--------------------------------------------------------------------------
|
| A delivery attempt is a logistics event.
|
| It does NOT change the shipment's main status.
|
| Example:
|
| Shipment status:
| out_for_delivery
|
| Tracking events:
|
| out_for_delivery
| delivery_attempted
| delivery_failed
|
| This allows multiple delivery attempts for the same shipment.
|
*/

export const recordDeliveryAttempt = async (
  shipmentId,
  description,
  location,
) => {
  const result = await prisma.$transaction(async (tx) => {
    /*
        |--------------------------------------------------------------------------
        | Lock Shipment
        |--------------------------------------------------------------------------
        */

    const shipmentRows = await tx.$queryRaw`
            SELECT
                id,
                status
            FROM shipments
            WHERE id = ${shipmentId}::uuid
            FOR UPDATE
        `;

    const shipment = shipmentRows[0];

    if (!shipment) {
      throw new AppError("Shipment not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Validate Shipment Status
        |--------------------------------------------------------------------------
        |
        | A delivery attempt only makes sense when the shipment
        | is currently out for delivery.
        |
        */

    if (shipment.status !== "out_for_delivery") {
      throw new AppError(
        "Delivery attempt can only be recorded when shipment is out for delivery",
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Create Delivery Attempt Event
        |--------------------------------------------------------------------------
        */

    const trackingEvent = await createTrackingEvent(
      tx,
      shipment.id,
      "delivery_attempted",
      description || "Delivery was attempted",
      location || null,
    );

    return trackingEvent;
  });

  return result;
};

/*
|--------------------------------------------------------------------------
| Record Failed Delivery
|--------------------------------------------------------------------------
|
| A failed delivery does NOT automatically change the main shipment
| status.
|
| This is because a failed attempt can be followed by another
| delivery attempt.
|
| Example:
|
| out_for_delivery
|       ↓
| delivery_attempted
|       ↓
| delivery_failed
|       ↓
| out_for_delivery
|
*/

export const recordFailedDelivery = async (shipmentId, reason, location) => {
  const result = await prisma.$transaction(async (tx) => {
    /*
        |--------------------------------------------------------------------------
        | Lock Shipment
        |--------------------------------------------------------------------------
        */

    const shipmentRows = await tx.$queryRaw`
            SELECT
                id,
                status
            FROM shipments
            WHERE id = ${shipmentId}::uuid
            FOR UPDATE
        `;

    const shipment = shipmentRows[0];

    if (!shipment) {
      throw new AppError("Shipment not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Validate Shipment Status
        |--------------------------------------------------------------------------
        |
        | A failed delivery should normally happen while the shipment
        | is out for delivery.
        |
        */

    if (shipment.status !== "out_for_delivery") {
      throw new AppError(
        "Failed delivery can only be recorded when shipment is out for delivery",
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Create Failed Delivery Event
        |--------------------------------------------------------------------------
        */

    const trackingEvent = await createTrackingEvent(
      tx,
      shipment.id,
      "delivery_failed",
      reason || "Delivery attempt failed",
      location || null,
    );

    return trackingEvent;
  });

  return result;
};

/*
|--------------------------------------------------------------------------
| Record Return To Sender
|--------------------------------------------------------------------------
|
| Return-to-sender is represented as a tracking event for now.
|
| We are intentionally NOT adding "return_to_sender" to the main
| shipment status machine yet.
|
| This keeps the core shipment lifecycle simple while still allowing
| realistic logistics tracking.
|
| Example:
|
| delivery_failed
|       ↓
| return_to_sender
|
*/

export const recordReturnToSender = async (shipmentId, reason, location) => {
  const result = await prisma.$transaction(async (tx) => {
    /*
        |--------------------------------------------------------------------------
        | Lock Shipment
        |--------------------------------------------------------------------------
        */

    const shipmentRows = await tx.$queryRaw`
            SELECT
                id,
                status
            FROM shipments
            WHERE id = ${shipmentId}::uuid
            FOR UPDATE
        `;

    const shipment = shipmentRows[0];

    if (!shipment) {
      throw new AppError("Shipment not found", 404);
    }

    /*
        |--------------------------------------------------------------------------
        | Prevent Return For Delivered Shipment
        |--------------------------------------------------------------------------
        */

    if (shipment.status === "delivered") {
      throw new AppError(
        "A delivered shipment cannot be marked as return to sender",
        400,
      );
    }

    /*
        |--------------------------------------------------------------------------
        | Create Return To Sender Event
        |--------------------------------------------------------------------------
        */

    const trackingEvent = await createTrackingEvent(
      tx,
      shipment.id,
      "return_to_sender",
      reason || "Shipment is being returned to sender",
      location || null,
    );

    return trackingEvent;
  });

  return result;
};

/*
|--------------------------------------------------------------------------
| Get Shipment Tracking History
|--------------------------------------------------------------------------
|
| Returns all tracking events for a shipment.
|
| Events are returned oldest → newest so the frontend can
| display a chronological timeline.
|
*/

export const getShipmentTrackingHistory = async (userId, shipmentId) => {
  /*
    |--------------------------------------------------------------------------
    | Verify Shipment Ownership
    |--------------------------------------------------------------------------
    |
    | Customer must only be able to see tracking information
    | for their own order.
    |
    */

  const shipment = await prisma.shipments.findFirst({
    where: {
      id: shipmentId,
      orders: {
        user_id: userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (!shipment) {
    throw new AppError("Shipment not found", 404);
  }

  /*
    |--------------------------------------------------------------------------
    | Get Tracking Events
    |--------------------------------------------------------------------------
    */

  const trackingEvents = await prisma.shipment_tracking_events.findMany({
    where: {
      shipment_id: shipment.id,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  return trackingEvents;
};

/*
|--------------------------------------------------------------------------
| Get Shipment By Order ID
|--------------------------------------------------------------------------
|
| Customer can only see the shipment belonging to their own order.
|
*/

export const getShipmentByOrderId = async (userId, orderId) => {
  const shipment = await prisma.shipments.findFirst({
    where: {
      order_id: orderId,
      orders: {
        user_id: userId,
      },
    },
    include: {
      orders: {
        include: {
          order_items: true,
        },
      },
      tracking_events: {
        orderBy: {
          created_at: "asc",
        },
      },
    },
  });

  if (!shipment) {
    throw new AppError("Shipment not found", 404);
  }

  return shipment;
};

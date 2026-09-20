import {
    createShipment,
    updateShipmentStatus,
    getShipmentByOrderId,
    addTrackingEvent,
    getShipmentTrackingHistory,
    recordDeliveryAttempt,
    recordFailedDelivery,
    recordReturnToSender,
} from "../services/shipment.service.js";


/*
|--------------------------------------------------------------------------
| Create Shipment
|--------------------------------------------------------------------------
*/

export const createShipmentController = async (req, res) => {
    const { orderId } = req.params;

    const {
        carrier,
        trackingNumber,
    } = req.body;

    const shipment = await createShipment(
        orderId,
        carrier,
        trackingNumber
    );

    res.status(201).json({
        success: true,
        message: "Shipment created successfully",
        shipment,
    });
};


/*
|--------------------------------------------------------------------------
| Update Shipment Status
|--------------------------------------------------------------------------
*/

export const updateShipmentStatusController = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const shipment = await updateShipmentStatus(
        id,
        status
    );

    res.status(200).json({
        success: true,
        message: "Shipment status updated successfully",
        shipment,
    });
};


/*
|--------------------------------------------------------------------------
| Add Tracking Event
|--------------------------------------------------------------------------
|
| Admin can manually add a logistics event.
|
*/

export const addTrackingEventController = async (req, res) => {
    const { id } = req.params;

    const {
        status,
        description,
        location,
    } = req.body;

    const trackingEvent = await addTrackingEvent(
        id,
        status,
        description,
        location
    );

    res.status(201).json({
        success: true,
        message: "Tracking event added successfully",
        trackingEvent,
    });
};


/*
|--------------------------------------------------------------------------
| Record Delivery Attempt
|--------------------------------------------------------------------------
|
| Records an attempt to deliver the package.
|
| This creates a tracking event but does NOT change
| the shipment's main status.
|
*/

export const recordDeliveryAttemptController = async (req, res) => {
    const { id } = req.params;

    const {
        description,
        location,
    } = req.body;

    const trackingEvent = await recordDeliveryAttempt(
        id,
        description,
        location
    );

    res.status(201).json({
        success: true,
        message: "Delivery attempt recorded successfully",
        trackingEvent,
    });
};


/*
|--------------------------------------------------------------------------
| Record Failed Delivery
|--------------------------------------------------------------------------
|
| Records that a delivery attempt failed.
|
| This creates a tracking event but does NOT change
| the shipment's main status.
|
*/

export const recordFailedDeliveryController = async (req, res) => {
    const { id } = req.params;

    const {
        reason,
        location,
    } = req.body;

    const trackingEvent = await recordFailedDelivery(
        id,
        reason,
        location
    );

    res.status(201).json({
        success: true,
        message: "Failed delivery recorded successfully",
        trackingEvent,
    });
};


/*
|--------------------------------------------------------------------------
| Record Return To Sender
|--------------------------------------------------------------------------
|
| Records that the shipment is being returned to the sender.
|
| For now, this is represented as a tracking event rather
| than changing the main shipment status.
|
*/

export const recordReturnToSenderController = async (req, res) => {
    const { id } = req.params;

    const {
        reason,
        location,
    } = req.body;

    const trackingEvent = await recordReturnToSender(
        id,
        reason,
        location
    );

    res.status(201).json({
        success: true,
        message: "Return to sender event recorded successfully",
        trackingEvent,
    });
};


/*
|--------------------------------------------------------------------------
| Get My Shipment
|--------------------------------------------------------------------------
*/

export const getShipmentByOrderIdController = async (req, res) => {
    const { orderId } = req.params;

    const shipment = await getShipmentByOrderId(
        req.user.id,
        orderId
    );

    res.status(200).json({
        success: true,
        message: "Shipment fetched successfully",
        shipment,
    });
};


/*
|--------------------------------------------------------------------------
| Get My Shipment Tracking History
|--------------------------------------------------------------------------
*/

export const getShipmentTrackingHistoryController = async (
    req,
    res
) => {
    const { id } = req.params;

    const trackingEvents =
        await getShipmentTrackingHistory(
            req.user.id,
            id
        );

    res.status(200).json({
        success: true,
        message: "Shipment tracking history fetched successfully",
        trackingEvents,
    });
};
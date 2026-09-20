-- CreateTable
CREATE TABLE "shipment_tracking_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipment_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "location" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_tracking_events_shipment_id_idx" ON "shipment_tracking_events"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_tracking_events_status_idx" ON "shipment_tracking_events"("status");

-- CreateIndex
CREATE INDEX "shipment_tracking_events_created_at_idx" ON "shipment_tracking_events"("created_at");

-- AddForeignKey
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "fk_tracking_event_shipment" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

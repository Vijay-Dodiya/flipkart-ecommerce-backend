-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelled_at" TIMESTAMP(6),
ADD COLUMN     "confirmed_at" TIMESTAMP(6),
ADD COLUMN     "delivered_at" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "out_for_delivery_at" TIMESTAMP(6);

/*
  Warnings:

  - A unique constraint covering the columns `[razorpay_refund_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "razorpay_refund_id" VARCHAR(100),
ADD COLUMN     "refund_status" VARCHAR(30),
ADD COLUMN     "refunded_at" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "orders_razorpay_refund_id_key" ON "orders"("razorpay_refund_id");

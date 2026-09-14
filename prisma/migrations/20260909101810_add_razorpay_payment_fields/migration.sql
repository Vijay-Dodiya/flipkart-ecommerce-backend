/*
  Warnings:

  - A unique constraint covering the columns `[razorpay_order_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[razorpay_payment_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "razorpay_order_id" VARCHAR(100),
ADD COLUMN     "razorpay_payment_id" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "orders_razorpay_order_id_key" ON "orders"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_razorpay_payment_id_key" ON "orders"("razorpay_payment_id");

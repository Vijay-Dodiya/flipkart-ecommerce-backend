-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "received_by" UUID,
ADD COLUMN     "rejected_by" UUID;

import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const body = JSON.stringify({
    entity: "event",
    event: "payment.failed",
    payload: {
        payment: {
            entity: {
                id: "pay_test_001",
                order_id: "order_test_001",
                amount: 149999,
                currency: "INR",
                status: "failed"
            }
        }
    }
});

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!secret) {
    throw new Error(
        "RAZORPAY_WEBHOOK_SECRET is missing from .env"
    );
}

const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

console.log("\n===== COPY THESE =====\n");

console.log("BODY:");
console.log(body);

console.log("\nSIGNATURE:");
console.log(signature);

console.log("\nEVENT ID:");
console.log("test-event-001");

console.log("\n=====================\n");
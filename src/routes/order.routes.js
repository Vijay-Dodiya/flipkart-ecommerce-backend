import express from "express";

import {
    createOrderController,
    getMyOrdersController,
    getOrderByIdController,
    confirmPaymentController,
    cancelOrderController,
} from "../controllers/order.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", authenticate, createOrderController);

router.get("/", authenticate, getMyOrdersController);

router.get("/:id", authenticate, getOrderByIdController);

router.patch("/:id/payment", authenticate, confirmPaymentController);

router.patch("/:id/cancel", authenticate, cancelOrderController);

export default router;
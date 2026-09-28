import express from "express";

import {
    createReturn,
    getMyReturnList,
    getMyReturn,
    cancelReturn,

    getReturns,
    getReturn,

    approve,
    reject,
    received,
    refund,
} from "../controllers/return.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

import { validate } from "../middleware/validate.middleware.js";

import {
    createReturnSchema,
    rejectReturnSchema,
    approveReturnSchema,
} from "../schemas/return.schema.js";


const router = express.Router();


// ============================================================
// CUSTOMER
// ============================================================

router.post(
    "/",
    authenticate,
    validate(createReturnSchema),
    createReturn
);


router.get(
    "/my",
    authenticate,
    getMyReturnList
);


router.get(
    "/my/:returnId",
    authenticate,
    getMyReturn
);


router.patch(
    "/my/:returnId/cancel",
    authenticate,
    cancelReturn
);


// ============================================================
// ADMIN
// ============================================================

router.get(
    "/admin",
    authenticate,
    authorize("admin"),
    getReturns
);


router.get(
    "/admin/:returnId",
    authenticate,
    authorize("admin"),
    getReturn
);


router.patch(
    "/admin/:returnId/approve",
    authenticate,
    authorize("admin"),
    validate(approveReturnSchema),
    approve
);


router.patch(
    "/admin/:returnId/reject",
    authenticate,
    authorize("admin"),
    validate(rejectReturnSchema),
    reject
);


router.patch(
    "/admin/:returnId/received",
    authenticate,
    authorize("admin"),
    received
);


router.patch(
    "/admin/:returnId/refund",
    authenticate,
    authorize("admin"),
    refund
);


export default router;
import express from "express";

import {
    addToCartController,
    getMyCartController,
    updateCartItemController,
    removeCartItemController,
    clearCartController,
} from "../controllers/cart.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

import { addToCartSchema } from "../schemas/cart.schema.js";
import { updateCartSchema } from "../schemas/update-cart.schema.js";

const router = express.Router();


/*
    ADD PRODUCT TO CART
    POST /api/cart/
*/
router.post(
    "/",
    authenticate,
    validate(addToCartSchema),
    addToCartController
);


/*
    GET MY CART
    GET /api/cart/
*/
router.get(
    "/",
    authenticate,
    getMyCartController
);


/*
    UPDATE CART ITEM
    PUT /api/cart/:productId
*/
router.put(
    "/:productId",
    authenticate,
    validate(updateCartSchema),
    updateCartItemController
);


/*
    REMOVE CART ITEM
    DELETE /api/cart/:productId
*/
router.delete(
    "/:productId",
    authenticate,
    removeCartItemController
);


/*
    CLEAR ENTIRE CART
    DELETE /api/cart/
*/
router.delete(
    "/",
    authenticate,
    clearCartController
);


export default router;
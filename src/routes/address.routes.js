import express from "express";

import {
    createAddressController,
    getMyAddressesController,
    getMyAddressByIdController,
    updateAddressController,
    deleteAddressController,
} from "../controllers/address.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";

import { validate } from "../middleware/validate.middleware.js";

import {
    createAddressSchema,
    updateAddressSchema,
} from "../schemas/address.schema.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| CREATE ADDRESS
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/addresses:
 *   post:
 *     summary: Create a new address
 *     description: Creates a new saved delivery address for the authenticated user.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *               - full_name
 *               - phone
 *               - address_line1
 *               - city
 *               - state
 *               - postal_code
 *             properties:
 *               label:
 *                 type: string
 *                 example: Office
 *               full_name:
 *                 type: string
 *                 example: Vijay Dodiya
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               address_line1:
 *                 type: string
 *                 example: 123 MG Road
 *               address_line2:
 *                 type: string
 *                 example: Near Central Mall
 *               city:
 *                 type: string
 *                 example: Indore
 *               state:
 *                 type: string
 *                 example: Madhya Pradesh
 *               postal_code:
 *                 type: string
 *                 example: "452001"
 *               country:
 *                 type: string
 *                 example: India
 *               is_default:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Address created successfully
 *       400:
 *         description: Invalid address data
 *       401:
 *         description: Authentication required
 */

router.post(
    "/",
    authenticate,
    validate(createAddressSchema),
    createAddressController,
);


/*
|--------------------------------------------------------------------------
| GET ALL ADDRESSES
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/addresses:
 *   get:
 *     summary: Get all my addresses
 *     description: Returns all saved addresses belonging to the authenticated user.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses fetched successfully
 *       401:
 *         description: Authentication required
 */

router.get(
    "/",
    authenticate,
    getMyAddressesController
);


/*
|--------------------------------------------------------------------------
| GET SINGLE ADDRESS
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/addresses/{id}:
 *   get:
 *     summary: Get address by ID
 *     description: Returns a specific saved address belonging to the authenticated user.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address fetched successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Address not found
 */

router.get(
    "/:id",
    authenticate,
    getMyAddressByIdController
);


/*
|--------------------------------------------------------------------------
| UPDATE ADDRESS
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/addresses/{id}:
 *   put:
 *     summary: Update an address
 *     description: Updates an existing saved address belonging to the authenticated user. All fields are optional.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Address ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 example: Home
 *               full_name:
 *                 type: string
 *                 example: Vijay Dodiya
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               address_line1:
 *                 type: string
 *                 example: 123 MG Road
 *               address_line2:
 *                 type: string
 *                 example: Near Central Mall
 *               city:
 *                 type: string
 *                 example: Indore
 *               state:
 *                 type: string
 *                 example: Madhya Pradesh
 *               postal_code:
 *                 type: string
 *                 example: "452001"
 *               country:
 *                 type: string
 *                 example: India
 *               is_default:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       400:
 *         description: Invalid address data
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Address not found
 */

router.put(
    "/:id",
    authenticate,
    validate(updateAddressSchema),
    updateAddressController,
);


/*
|--------------------------------------------------------------------------
| DELETE ADDRESS
|--------------------------------------------------------------------------
*/

/**
 * @swagger
 * /api/addresses/{id}:
 *   delete:
 *     summary: Delete an address
 *     description: Deletes a saved address belonging to the authenticated user.
 *     tags:
 *       - Addresses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Address not found
 */

router.delete(
    "/:id",
    authenticate,
    deleteAddressController
);


export default router;
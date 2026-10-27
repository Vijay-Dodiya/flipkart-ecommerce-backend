
import express from "express";

import {
  createImage,
  getImages,
  getImage,
  updateImage,
  deleteImage,
  setPrimaryImage,
} from "../controllers/productImage.controller.js";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Product Images
 *     description: APIs for managing product images
 *
 * components:
 *   parameters:
 *     ProductId:
 *       in: path
 *       name: productId
 *       required: true
 *       description: ID of the product
 *       schema:
 *         type: string
 *       example: "product-123"
 *
 *     ImageId:
 *       in: path
 *       name: imageId
 *       required: true
 *       description: ID of the product image
 *       schema:
 *         type: string
 *       example: "image-123"
 *
 *   schemas:
 *     ProductImage:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Product image ID
 *           example: "image-123"
 *         productId:
 *           type: string
 *           description: Associated product ID
 *           example: "product-123"
 *         imageUrl:
 *           type: string
 *           format: uri
 *           example: "https://example.com/images/product.jpg"
 *         altText:
 *           type: string
 *           nullable: true
 *           maxLength: 255
 *           example: "Front view of the product"
 *         isPrimary:
 *           type: boolean
 *           example: true
 *         sortOrder:
 *           type: integer
 *           minimum: 0
 *           example: 0
 *
 *     CreateProductImageInput:
 *       type: object
 *       required:
 *         - imageUrl
 *       properties:
 *         imageUrl:
 *           type: string
 *           format: uri
 *           description: Valid URL for the product image
 *           example: "https://example.com/images/product.jpg"
 *         altText:
 *           type: string
 *           nullable: true
 *           maxLength: 255
 *           description: Optional alternative text; may be null
 *           example: "Front view of the product"
 *         isPrimary:
 *           type: boolean
 *           default: false
 *           description: Whether this is the primary product image
 *           example: false
 *         sortOrder:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *           description: Display order of the image
 *           example: 0
 *
 *     UpdateProductImageInput:
 *       type: object
 *       properties:
 *         imageUrl:
 *           type: string
 *           format: uri
 *           description: Updated image URL
 *           example: "https://example.com/images/product-updated.jpg"
 *         altText:
 *           type: string
 *           nullable: true
 *           maxLength: 255
 *           description: Updated alternative text; may be null
 *           example: "Updated product image"
 *         isPrimary:
 *           type: boolean
 *           description: Whether this image should be primary
 *           example: true
 *         sortOrder:
 *           type: integer
 *           minimum: 0
 *           description: Updated display order
 *           example: 1
 *
 *     ProductImageResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Product image created successfully"
 *         data:
 *           $ref: '#/components/schemas/ProductImage'
 *
 *     ProductImagesResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductImage'
 *
 *     ApiError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Validation failed"
 */

/**
 * @swagger
 * /products/{productId}/images:
 *   get:
 *     summary: Get all images for a product
 *     description: Returns all images associated with the specified product. No authentication is required.
 *     tags: [Product Images]
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *     responses:
 *       200:
 *         description: Images retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductImagesResponse'
 *       400:
 *         description: Invalid product ID or request
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.get("/products/:productId/images", getImages);

/**
 * @swagger
 * /products/{productId}/images/{imageId}:
 *   get:
 *     summary: Get a specific product image
 *     description: Returns one image belonging to the specified product. No authentication is required.
 *     tags: [Product Images]
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *       - $ref: '#/components/parameters/ImageId'
 *     responses:
 *       200:
 *         description: Image retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductImageResponse'
 *       400:
 *         description: Invalid product or image ID
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/products/:productId/images/:imageId",
  getImage,
);

/**
 * @swagger
 * /products/{productId}/images:
 *   post:
 *     summary: Add an image to a product
 *     description: Creates a product image. Admin authentication is required.
 *     tags: [Product Images]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductImageInput'
 *           example:
 *             imageUrl: "https://example.com/images/product.jpg"
 *             altText: "Front view of the product"
 *             isPrimary: false
 *             sortOrder: 0
 *     responses:
 *       201:
 *         description: Product image created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductImageResponse'
 *       400:
 *         description: Request validation failed
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/products/:productId/images",
  authenticate,
  authorize("admin"),
  createImage,
);

/**
 * @swagger
 * /products/{productId}/images/{imageId}:
 *   put:
 *     summary: Update a product image
 *     description: Updates the supplied fields of an existing product image. Admin authentication is required.
 *     tags: [Product Images]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *       - $ref: '#/components/parameters/ImageId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProductImageInput'
 *           example:
 *             imageUrl: "https://example.com/images/product-updated.jpg"
 *             altText: "Updated product image"
 *             isPrimary: false
 *             sortOrder: 1
 *     responses:
 *       200:
 *         description: Product image updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductImageResponse'
 *       400:
 *         description: Request validation failed
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
router.put(
  "/products/:productId/images/:imageId",
  authenticate,
  authorize("admin"),
  updateImage,
);

/**
 * @swagger
 * /products/{productId}/images/{imageId}:
 *   delete:
 *     summary: Delete a product image
 *     description: Deletes an image belonging to a product. Admin authentication is required.
 *     tags: [Product Images]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *       - $ref: '#/components/parameters/ImageId'
 *     responses:
 *       200:
 *         description: Product image deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid product or image ID
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  "/products/:productId/images/:imageId",
  authenticate,
  authorize("admin"),
  deleteImage,
);

/**
 * @swagger
 * /products/{productId}/images/{imageId}/primary:
 *   patch:
 *     summary: Set the primary product image
 *     description: Marks an image as the primary image for its product. Admin authentication is required.
 *     tags: [Product Images]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ProductId'
 *       - $ref: '#/components/parameters/ImageId'
 *     responses:
 *       200:
 *         description: Primary image updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductImageResponse'
 *       400:
 *         description: Invalid product or image ID
 *       401:
 *         description: Authentication required or token invalid
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/products/:productId/images/:imageId/primary",
  authenticate,
  authorize("admin"),
  setPrimaryImage,
);

export default router;

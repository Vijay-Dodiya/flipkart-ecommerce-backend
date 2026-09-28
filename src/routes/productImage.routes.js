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

/*
 * Public
 * Get all images for a product
 */
router.get("/products/:productId/images", getImages);

/*
 * Public
 * Get one image
 */
router.get("/products/:productId/images/:imageId", getImage);

/*
 * Admin
 * Add image
 */
router.post(
  "/products/:productId/images",
  authenticate,
  authorize("admin"),
  createImage,
);

/*
 * Admin
 * Update image
 */
router.put(
  "/products/:productId/images/:imageId",
  authenticate,
  authorize("admin"),
  updateImage,
);

/*
 * Admin
 * Delete image
 */
router.delete(
  "/products/:productId/images/:imageId",
  authenticate,
  authorize("admin"),
  deleteImage,
);

/*
 * Admin
 * Set primary image
 */
router.patch(
  "/products/:productId/images/:imageId/primary",
  authenticate,
  authorize("admin"),
  setPrimaryImage,
);

export default router;

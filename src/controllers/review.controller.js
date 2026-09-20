import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createReview,
    getProductReviews,
    updateReview,
    deleteReview,
} from "../services/review.service.js";

export const createReviewController = asyncHandler(
    async (req, res) => {
        const { id: userId } = req.user;
        const { productId } = req.params;

        const review = await createReview(
            userId,
            productId,
            req.body
        );

        res.status(201).json({
            success: true,
            message: "Review created successfully",
            data: review,
        });
    }
);

export const getProductReviewsController = asyncHandler(
    async (req, res) => {
        const { productId } = req.params;

        const page = Math.max(
            Number.parseInt(req.query.page, 10) || 1,
            1
        );

        const limit = Math.min(
            Math.max(
                Number.parseInt(req.query.limit, 10) || 10,
                1
            ),
            50
        );

        const result = await getProductReviews(
            productId,
            page,
            limit
        );

        res.status(200).json({
            success: true,
            message: "Product reviews fetched successfully",
            data: result,
        });
    }
);

export const updateReviewController = asyncHandler(
    async (req, res) => {
        const { id: userId } = req.user;
        const { id: reviewId } = req.params;

        const review = await updateReview(
            userId,
            reviewId,
            req.body
        );

        res.status(200).json({
            success: true,
            message: "Review updated successfully",
            data: review,
        });
    }
);

export const deleteReviewController = asyncHandler(
    async (req, res) => {
        const { id: userId } = req.user;
        const { id: reviewId } = req.params;

        const result = await deleteReview(
            userId,
            reviewId
        );

        res.status(200).json({
            success: true,
            message: "Review deleted successfully",
            data: result,
        });
    }
);
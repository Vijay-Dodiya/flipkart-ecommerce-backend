import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";

const PRODUCT_NOT_FOUND = "Product not found";

const getDeliveredPurchase = async (userId, productId) => {
    return prisma.orders.findFirst({
        where: {
            user_id: userId,
            status: "delivered",
            order_items: {
                some: {
                    product_id: productId,
                },
            },
        },
        select: {
            id: true,
        },
    });
};

export const createReview = async (
    userId,
    productId,
    { rating, review }
) => {
    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        throw new AppError(PRODUCT_NOT_FOUND, 404);
    }

    const deliveredOrder = await getDeliveredPurchase(
        userId,
        productId
    );

    if (!deliveredOrder) {
        throw new AppError(
            "You can review a product only after receiving it",
            403
        );
    }

    const existingReview = await prisma.reviews.findUnique({
        where: {
            user_id_product_id: {
                user_id: userId,
                product_id: productId,
            },
        },
    });

    if (existingReview) {
        throw new AppError(
            "You have already reviewed this product",
            409
        );
    }

    return prisma.reviews.create({
        data: {
            user_id: userId,
            product_id: productId,
            rating,
            review: review ?? null,
        },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
};

export const getProductReviews = async (
    productId,
    page = 1,
    limit = 10
) => {
    const product = await prisma.products.findUnique({
        where: {
            id: productId,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        throw new AppError(PRODUCT_NOT_FOUND, 404);
    }

    const skip = (page - 1) * limit;

    const [reviews, total] = await prisma.$transaction([
        prisma.reviews.findMany({
            where: {
                product_id: productId,
            },
            skip,
            take: limit,
            orderBy: {
                created_at: "desc",
            },
            include: {
                users: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        }),

        prisma.reviews.count({
            where: {
                product_id: productId,
            },
        }),
    ]);

    const aggregate = await prisma.reviews.aggregate({
        where: {
            product_id: productId,
        },
        _avg: {
            rating: true,
        },
        _count: {
            id: true,
        },
    });

    return {
        reviews,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
        summary: {
            averageRating: aggregate._avg.rating
                ? Number(aggregate._avg.rating.toFixed(2))
                : 0,
            reviewCount: aggregate._count.id,
        },
    };
};

export const updateReview = async (
    userId,
    reviewId,
    data
) => {
    const existingReview = await prisma.reviews.findUnique({
        where: {
            id: reviewId,
        },
    });

    if (!existingReview) {
        throw new AppError("Review not found", 404);
    }

    if (existingReview.user_id !== userId) {
        throw new AppError(
            "You can update only your own review",
            403
        );
    }

    return prisma.reviews.update({
        where: {
            id: reviewId,
        },
        data: {
            ...(data.rating !== undefined && {
                rating: data.rating,
            }),
            ...(data.review !== undefined && {
                review: data.review,
            }),
            updated_at: new Date(),
        },
        include: {
            users: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });
};

export const deleteReview = async (
    userId,
    reviewId
) => {
    const existingReview = await prisma.reviews.findUnique({
        where: {
            id: reviewId,
        },
    });

    if (!existingReview) {
        throw new AppError("Review not found", 404);
    }

    if (existingReview.user_id !== userId) {
        throw new AppError(
            "You can delete only your own review",
            403
        );
    }

    await prisma.reviews.delete({
        where: {
            id: reviewId,
        },
    });

    return {
        reviewId,
    };
};
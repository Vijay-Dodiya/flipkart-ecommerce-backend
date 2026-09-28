import prisma from "../config/prisma.js";

import {
  getCache,
  setCache,
  deleteCache,
  getProductListCacheVersion,
  invalidateProductListCache,
} from "../utils/cache.js";

import AppError from "../utils/AppError.js";
import slugify from "../utils/slugify.js";

/*
|--------------------------------------------------------------------------
| PRODUCT CACHE CONFIGURATION
|--------------------------------------------------------------------------
|
| Individual product details are cached using:
|
| product:${productId}
|
| Example:
|
| product:550e8400-e29b-41d4-a716-446655440000
|
| TTL = 60 seconds
|
|--------------------------------------------------------------------------
*/

const PRODUCT_CACHE_TTL = 60;

/*
|--------------------------------------------------------------------------
| PRODUCT LIST CACHE CONFIGURATION
|--------------------------------------------------------------------------
|
| Product list results are cached for 60 seconds.
|
| Every different combination of filters/pagination/sorting
| gets its own Redis cache key.
|
| Example:
|
| ?brand=Samsung&page=1
|
| and
|
| ?brand=Apple&page=1
|
| will have different Redis cache keys.
|
|--------------------------------------------------------------------------
*/

const PRODUCT_LIST_CACHE_TTL = 60;

const PRODUCT_IMAGES_INCLUDE = {
    images: {
        orderBy: [
            {
                isPrimary: "desc",
            },
            {
                sortOrder: "asc",
            },
            {
                createdAt: "asc",
            },
        ],
    },
};

/*
|--------------------------------------------------------------------------
| CREATE PRODUCT LIST CACHE KEY
|--------------------------------------------------------------------------
|
| Every different product query needs a different Redis key.
|
| We include:
|
| - page
| - limit
| - search
| - brand
| - categoryId
| - category
| - minPrice
| - maxPrice
| - inStock
| - sort
|
| The cache version is also included.
|
| When a product is created/updated/deleted, the version changes.
| Therefore, all previous product-list cache keys automatically
| become obsolete.
|
|--------------------------------------------------------------------------
*/

const createProductListCacheKey = (version, queryParams) => {
  /*
  |--------------------------------------------------------------------------
  | Normalize query parameters
  |--------------------------------------------------------------------------
  |
  | This makes sure undefined values do not create unexpected
  | cache keys.
  |
  */

  const normalizedQuery = {
    page: queryParams.page ?? 1,
    limit: queryParams.limit ?? 10,
    search: queryParams.search ?? null,
    brand: queryParams.brand ?? null,
    categoryId: queryParams.categoryId ?? null,
    category: queryParams.category ?? null,
    minPrice: queryParams.minPrice ?? null,
    maxPrice: queryParams.maxPrice ?? null,
    inStock: queryParams.inStock ?? null,
    sort: queryParams.sort ?? "newest",
  };

  /*
  |--------------------------------------------------------------------------
  | Create Redis cache key
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | products:list:v2:{"page":1,"limit":10,...}
  |
  */

  return `products:list:v${version}:${JSON.stringify(
    normalizedQuery
  )}`;
};

/*
|--------------------------------------------------------------------------
| CREATE PRODUCT
|--------------------------------------------------------------------------
*/

export const createProduct = async (productData) => {
  /*
  |--------------------------------------------------------------------------
  | Separate quantity
  |--------------------------------------------------------------------------
  |
  | quantity belongs to the inventory table,
  | not the products table.
  |
  */

  const { quantity, ...productFields } = productData;

  /*
  |--------------------------------------------------------------------------
  | Everything below happens inside one transaction
  |--------------------------------------------------------------------------
  */

  const result = await prisma.$transaction(async (tx) => {
    /*
    |--------------------------------------------------------------------------
    | 1. Check if category exists
    |--------------------------------------------------------------------------
    */

    const category = await tx.categories.findUnique({
      where: {
        id: productFields.category_id,
      },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Generate base slug
    |--------------------------------------------------------------------------
    */

    const baseSlug = slugify(productFields.name);

    /*
    |--------------------------------------------------------------------------
    | 3. Start with base slug
    |--------------------------------------------------------------------------
    */

    let slug = baseSlug;
    let counter = 2;

    /*
    |--------------------------------------------------------------------------
    | 4. Make sure slug is unique
    |--------------------------------------------------------------------------
    */

    while (
      await tx.products.findUnique({
        where: {
          slug: slug,
        },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Create product
    |--------------------------------------------------------------------------
    */

    const product = await tx.products.create({
      data: {
        ...productFields,
        slug: slug,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | 6. Create inventory automatically
    |--------------------------------------------------------------------------
    */

    const inventory = await tx.inventory.create({
      data: {
        product_id: product.id,
        quantity: quantity,
        reserved_quantity: 0,
        low_stock_threshold: 10,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | 7. Return both product and inventory
    |--------------------------------------------------------------------------
    */

    return {
      product,
      inventory,
    };
  });

  /*
  |--------------------------------------------------------------------------
  | Invalidate product-list cache
  |--------------------------------------------------------------------------
  |
  | Product was successfully created in PostgreSQL.
  |
  | The existing product-list cache is now outdated.
  |
  | Instead of deleting every possible:
  |
  | products:list:...
  |
  | key, we simply increase the cache version.
  |
  | Old cache keys become obsolete automatically.
  |
  */

  await invalidateProductListCache();

  return result;
};

/*
|--------------------------------------------------------------------------
| GET ALL PRODUCTS
|--------------------------------------------------------------------------
|
| Supports:
|
| - Pagination
| - Search
| - Multiple brand filtering
| - Category ID filtering
| - Multiple category filtering
| - Minimum price
| - Maximum price
| - In-stock filtering
| - Sorting
| - Redis caching
|
|--------------------------------------------------------------------------
*/

export const getAllProducts = async (queryParams = {}) => {
  /*
  |--------------------------------------------------------------------------
  | 1. Extract query parameters
  |--------------------------------------------------------------------------
  */

  const {
    page = 1,
    limit = 10,
    search,
    brand,
    categoryId,
    category,
    minPrice,
    maxPrice,
    sort = "newest",
    inStock,
  } = queryParams;

  /*
  |--------------------------------------------------------------------------
  | 2. Get current product-list cache version
  |--------------------------------------------------------------------------
  */

  const cacheVersion = await getProductListCacheVersion();

  /*
  |--------------------------------------------------------------------------
  | 3. Create unique cache key
  |--------------------------------------------------------------------------
  |
  | Different queries produce different cache keys.
  |
  | Example:
  |
  | brand=Samsung -> one cache
  |
  | brand=Apple -> another cache
  |
  */

  const cacheKey = createProductListCacheKey(
    cacheVersion,
    queryParams
  );

  /*
  |--------------------------------------------------------------------------
  | 4. Check Redis before PostgreSQL
  |--------------------------------------------------------------------------
  */

  const cachedResult = await getCache(cacheKey);

  /*
  |--------------------------------------------------------------------------
  | CACHE HIT
  |--------------------------------------------------------------------------
  |
  | Redis already has the result for this exact query.
  |
  | PostgreSQL does not need to execute the query.
  |
  */

  if (cachedResult) {
    console.log(
      "PRODUCT LIST CACHE HIT:",
      cacheKey
    );

    return JSON.parse(cachedResult);
  }

  /*
  |--------------------------------------------------------------------------
  | CACHE MISS
  |--------------------------------------------------------------------------
  |
  | Redis doesn't have this query result.
  |
  | Continue to PostgreSQL.
  |
  */

  console.log(
    "PRODUCT LIST CACHE MISS:",
    cacheKey
  );

  /*
  |--------------------------------------------------------------------------
  | 5. Calculate pagination offset
  |--------------------------------------------------------------------------
  */

  const skip = (page - 1) * limit;

  /*
  |--------------------------------------------------------------------------
  | 6. Build Prisma WHERE condition
  |--------------------------------------------------------------------------
  */

  const where = {};

  /*
  |--------------------------------------------------------------------------
  | SEARCH
  |--------------------------------------------------------------------------
  |
  | Search across:
  |
  | - Product name
  | - Description
  | - Brand
  | - SKU
  |
  */

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        brand: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        sku: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  /*
  |--------------------------------------------------------------------------
  | BRAND FILTER
  |--------------------------------------------------------------------------
  |
  | Supports multiple brands.
  |
  | Example:
  |
  | ?brand=Samsung,Apple
  |
  */

  if (brand?.length) {
    where.brand = {
      in: brand,
      mode: "insensitive",
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CATEGORY ID FILTER
  |--------------------------------------------------------------------------
  */

  if (categoryId) {
    where.category_id = categoryId;
  }

  /*
  |--------------------------------------------------------------------------
  | CATEGORY SLUG FILTER
  |--------------------------------------------------------------------------
  |
  | Supports multiple categories.
  |
  | Example:
  |
  | ?category=smartphones,laptops
  |
  */

  if (category?.length) {
    where.categories = {
      slug: {
        in: category,
        mode: "insensitive",
      },
    };
  }

  /*
  |--------------------------------------------------------------------------
  | PRICE FILTER
  |--------------------------------------------------------------------------
  */

  if (
    minPrice !== undefined ||
    maxPrice !== undefined
  ) {
    where.price = {};

    if (minPrice !== undefined) {
      where.price.gte = minPrice;
    }

    if (maxPrice !== undefined) {
      where.price.lte = maxPrice;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STOCK FILTER
  |--------------------------------------------------------------------------
  */

  if (inStock !== undefined) {
    where.inventory = inStock
      ? {
          quantity: {
            gt: 0,
          },
        }
      : {
          quantity: {
            lte: 0,
          },
        };
  }

  /*
  |--------------------------------------------------------------------------
  | 7. Build sorting configuration
  |--------------------------------------------------------------------------
  */

  let orderBy;

  switch (sort) {
    case "price_asc":
      orderBy = {
        price: "asc",
      };
      break;

    case "price_desc":
      orderBy = {
        price: "desc",
      };
      break;

    case "oldest":
      orderBy = {
        created_at: "asc",
      };
      break;

    case "name_asc":
      orderBy = {
        name: "asc",
      };
      break;

    case "name_desc":
      orderBy = {
        name: "desc",
      };
      break;

    case "newest":
    default:
      orderBy = {
        created_at: "desc",
      };
      break;
  }

  /*
  |--------------------------------------------------------------------------
  | 8. Execute PostgreSQL queries
  |--------------------------------------------------------------------------
  |
  | We execute:
  |
  | 1. Count matching products
  | 2. Fetch paginated products
  |
  */

  const [
    totalProducts,
    products,
  ] = await prisma.$transaction([
    prisma.products.count({
      where,
    }),

    prisma.products.findMany({
      where,

      include: {
        categories: true,
        inventory: true,
        ...PRODUCT_IMAGES_INCLUDE,
      },

      orderBy,

      skip,

      take: limit,
    }),
  ]);

  /*
  |--------------------------------------------------------------------------
  | 9. Calculate total pages
  |--------------------------------------------------------------------------
  */

  const totalPages =
    Math.ceil(totalProducts / limit);

  /*
  |--------------------------------------------------------------------------
  | 10. Build final API result
  |--------------------------------------------------------------------------
  */

  const result = {
    products,

    pagination: {
      page,
      limit,
      totalProducts,
      totalPages,

      hasNextPage:
        page < totalPages,

      hasPreviousPage:
        page > 1,
    },
  };

  /*
  |--------------------------------------------------------------------------
  | 11. Store result in Redis
  |--------------------------------------------------------------------------
  |
  | Redis stores strings, so we convert the JavaScript object
  | into JSON before storing it.
  |
  */

  await setCache(
    cacheKey,
    JSON.stringify(result),
    PRODUCT_LIST_CACHE_TTL
  );

  /*
  |--------------------------------------------------------------------------
  | 12. Return result
  |--------------------------------------------------------------------------
  */

  return result;
};

/*
|--------------------------------------------------------------------------
| GET PRODUCT BY ID
|--------------------------------------------------------------------------
|
| Redis caching is used for individual product details.
|
|--------------------------------------------------------------------------
*/

export const getProductById = async (productId) => {
  const cacheKey = `product:${productId}`;

  /*
  |--------------------------------------------------------------------------
  | 1. Check Redis
  |--------------------------------------------------------------------------
  */

  const cachedProduct = await getCache(cacheKey);

  if (cachedProduct) {
    console.log(
      `Redis cache HIT: ${cacheKey}`
    );

    return JSON.parse(cachedProduct);
  }

  console.log(
    `Redis cache MISS: ${cacheKey}`
  );

  /*
  |--------------------------------------------------------------------------
  | 2. Get product from PostgreSQL
  |--------------------------------------------------------------------------
  */

  const product = await prisma.products.findUnique({
    where: {
      id: productId,
    },

    include: {
      categories: true,
      inventory: true,
      ...PRODUCT_IMAGES_INCLUDE,
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  /*
  |--------------------------------------------------------------------------
  | 3. Store product in Redis
  |--------------------------------------------------------------------------
  */

  await setCache(
    cacheKey,
    JSON.stringify(product),
    PRODUCT_CACHE_TTL
  );

  /*
  |--------------------------------------------------------------------------
  | 4. Return product
  |--------------------------------------------------------------------------
  */

  return product;
};

/*
|--------------------------------------------------------------------------
| UPDATE PRODUCT
|--------------------------------------------------------------------------
*/

export const updateProduct = async (
  productId,
  productData
) => {
  /*
  |--------------------------------------------------------------------------
  | Separate quantity because it belongs to inventory
  |--------------------------------------------------------------------------
  */

  const {
    quantity,
    ...productFields
  } = productData;

  const result = await prisma.$transaction(
    async (tx) => {
      /*
      |--------------------------------------------------------------------------
      | 1. Check if product exists
      |--------------------------------------------------------------------------
      */

      const existingProduct =
        await tx.products.findUnique({
          where: {
            id: productId,
          },
        });

      if (!existingProduct) {
        throw new AppError(
          "Product not found",
          404
        );
      }

      /*
      |--------------------------------------------------------------------------
      | 2. If category is being changed,
      |    check that it exists
      |--------------------------------------------------------------------------
      */

      if (productFields.category_id) {
        const category =
          await tx.categories.findUnique({
            where: {
              id: productFields.category_id,
            },
          });

        if (!category) {
          throw new AppError(
            "Category not found",
            404
          );
        }
      }

      /*
      |--------------------------------------------------------------------------
      | 3. If SKU is being changed,
      |    check if it is already used
      |--------------------------------------------------------------------------
      */

      if (productFields.sku) {
        const existingSku =
          await tx.products.findFirst({
            where: {
              sku: productFields.sku,

              NOT: {
                id: productId,
              },
            },
          });

        if (existingSku) {
          throw new AppError(
            "SKU already exists",
            409
          );
        }
      }

      /*
      |--------------------------------------------------------------------------
      | 4. If name is being changed,
      |    generate a new unique slug
      |--------------------------------------------------------------------------
      */

      let slug;

      if (productFields.name) {
        const baseSlug =
          slugify(productFields.name);

        slug = baseSlug;

        let counter = 2;

        while (
          await tx.products.findFirst({
            where: {
              slug: slug,

              NOT: {
                id: productId,
              },
            },
          })
        ) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      /*
      |--------------------------------------------------------------------------
      | 5. Update product
      |--------------------------------------------------------------------------
      */

      const product =
        await tx.products.update({
          where: {
            id: productId,
          },

          data: {
            ...productFields,

            ...(slug && { slug }),
          },
        });

      /*
      |--------------------------------------------------------------------------
      | 6. Update inventory if quantity was provided
      |--------------------------------------------------------------------------
      */

      let inventory =
        await tx.inventory.findUnique({
          where: {
            product_id: productId,
          },
        });

      if (!inventory) {
        throw new AppError(
          "Inventory not found",
          404
        );
      }

      if (quantity !== undefined) {
        inventory =
          await tx.inventory.update({
            where: {
              product_id: productId,
            },

            data: {
              quantity: quantity,
            },
          });
      }

      /*
      |--------------------------------------------------------------------------
      | 7. Return updated product and inventory
      |--------------------------------------------------------------------------
      */

      return {
        product,
        inventory,
      };
    }
  );

  /*
  |--------------------------------------------------------------------------
  | INVALIDATE PRODUCT LIST CACHE
  |--------------------------------------------------------------------------
  |
  | Product information or inventory has changed.
  |
  | Therefore, previously cached product-list responses may now
  | contain outdated information.
  |
  | We increase the cache version instead of trying to find and
  | delete every possible products:list:* Redis key.
  |
  */

  await invalidateProductListCache();

  /*
  |--------------------------------------------------------------------------
  | INVALIDATE INDIVIDUAL PRODUCT CACHE
  |--------------------------------------------------------------------------
  |
  | This product has its own Redis cache:
  |
  | product:${productId}
  |
  | Delete it because the product has changed.
  |
  */

  await deleteCache(
    `product:${productId}`
  );

  return result;
};

/*
|--------------------------------------------------------------------------
| DELETE PRODUCT
|--------------------------------------------------------------------------
*/

export const deleteProduct = async (
  productId
) => {
  const result = await prisma.$transaction(
    async (tx) => {
      /*
      |--------------------------------------------------------------------------
      | 1. Check if product exists
      |--------------------------------------------------------------------------
      */

      const product =
        await tx.products.findUnique({
          where: {
            id: productId,
          },
        });

      if (!product) {
        throw new AppError(
          "Product not found",
          404
        );
      }

      /*
      |--------------------------------------------------------------------------
      | 2. Check if inventory exists
      |--------------------------------------------------------------------------
      */

      const inventory =
        await tx.inventory.findUnique({
          where: {
            product_id: productId,
          },
        });

      /*
      |--------------------------------------------------------------------------
      | 3. Delete inventory first
      |--------------------------------------------------------------------------
      |
      | inventory.product_id references products.id.
      |
      | Therefore, inventory must be deleted before
      | deleting the product.
      |
      */

      if (inventory) {
        await tx.inventory.delete({
          where: {
            product_id: productId,
          },
        });
      }

      /*
      |--------------------------------------------------------------------------
      | 4. Delete product
      |--------------------------------------------------------------------------
      */

      await tx.products.delete({
        where: {
          id: productId,
        },
      });

      return true;
    }
  );

  /*
  |--------------------------------------------------------------------------
  | INVALIDATE PRODUCT LIST CACHE
  |--------------------------------------------------------------------------
  |
  | The product no longer exists.
  |
  | Therefore all previously cached product-list results
  | may contain the deleted product.
  |
  | Incrementing the cache version makes all old list-cache
  | entries obsolete.
  |
  */

  await invalidateProductListCache();

  /*
  |--------------------------------------------------------------------------
  | INVALIDATE INDIVIDUAL PRODUCT CACHE
  |--------------------------------------------------------------------------
  |
  | Remove:
  |
  | product:${productId}
  |
  | so the deleted product cannot be returned from Redis.
  |
  */

  await deleteCache(
    `product:${productId}`
  );

  return result;
};
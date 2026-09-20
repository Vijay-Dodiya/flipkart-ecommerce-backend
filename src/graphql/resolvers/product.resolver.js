// ========================================================
// PRODUCT GRAPHQL RESOLVER
//
// A resolver tells GraphQL what to do when a particular
// Query or Mutation is requested.
//
// IMPORTANT:
// We are NOT writing Prisma code here.
//
// The resolver will reuse our existing product service.
// ========================================================

import { getProductById } from "../../services/product.service.js";


// ========================================================
// Query Resolvers
// ========================================================

const productResolver = {

    Query: {

        // ------------------------------------------------
        // product
        //
        // GraphQL request:
        //
        // query {
        //     product(id: "...") {
        //         id
        //         name
        //         price
        //     }
        // }
        //
        // GraphQL gives us:
        //
        // _     -> parent/root object
        // args  -> arguments provided by the client
        // ------------------------------------------------

        product: async (_, { id }) => {

            // Reuse our existing REST service.
            //
            // We are NOT creating another database
            // implementation for GraphQL.
            const product = await getProductById(id);

            return product;
        },
    },
};

export default productResolver;
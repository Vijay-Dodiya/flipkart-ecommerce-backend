// ========================================================
// GRAPHQL RESOLVERS INDEX
//
// This file combines all GraphQL resolvers.
//
// Instead of importing every resolver directly into
// app.js, app.js will only need to import this file.
// ========================================================

import productResolver from "./product.resolver.js";


// ========================================================
// Combined GraphQL Resolvers
// ========================================================

const resolvers = {

    Query: {

        // Product queries
        ...productResolver.Query,
    },
};

export default resolvers;
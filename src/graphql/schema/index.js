// ========================================================
// GRAPHQL SCHEMA INDEX
//
// This file combines all GraphQL schemas.
//
// As our project grows, we will add:
//
// product
// category
// user
// order
// cart
// etc.
// ========================================================

import productSchema from "./product.schema.js";


// Combine all GraphQL type definitions into one string.
const typeDefs = `#graphql

    ${productSchema}

`;

export default typeDefs;
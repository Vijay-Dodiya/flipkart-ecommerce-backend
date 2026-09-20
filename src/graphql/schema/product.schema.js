// ========================================================
// PRODUCT GRAPHQL SCHEMA
//
// This file defines what a Product looks like inside
// our GraphQL API.
//
// IMPORTANT:
// This does NOT create a database table.
// It only defines the GraphQL API contract.
// ========================================================

const productSchema = `#graphql

    # ----------------------------------------------------
    # Product Type
    #
    # This describes the fields that GraphQL clients
    # are allowed to request from a Product.
    # ----------------------------------------------------

    type Product {
        id: ID!
        name: String!
        price: Float!
    }


    # ----------------------------------------------------
    # Query
    #
    # Query is used for READ operations in GraphQL.
    #
    # product(id: ID!)
    # means:
    # "Give me one product using its ID."
    # ----------------------------------------------------

    type Query {
        product(id: ID!): Product
    }

`;

export default productSchema;
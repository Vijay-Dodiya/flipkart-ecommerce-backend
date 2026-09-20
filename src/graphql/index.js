// ========================================================
// GRAPHQL SERVER SETUP
//
// This file creates and configures our Apollo GraphQL
// server.
//
// IMPORTANT:
//
// We already have an Express server in app.js.
//
// Therefore, we are NOT creating another Express server.
//
// Apollo Server will simply be mounted onto our existing
// Express application at:
//
// /graphql
//
// Architecture:
//
// Express
//    ↓
// /graphql
//    ↓
// Apollo Server
//    ↓
// GraphQL Schema + Resolvers
//    ↓
// Existing Service Layer
// ========================================================

import { ApolloServer } from "@apollo/server";

import { expressMiddleware } from "@as-integrations/express5";

import typeDefs from "./schema/index.js";

import resolvers from "./resolvers/index.js";

import { createGraphQLContext } from "./context.js";


// ========================================================
// Create Apollo Server
// ========================================================
//
// Apollo Server receives:
//
// 1. typeDefs
//      ↓
//      GraphQL schema
//
// 2. resolvers
//      ↓
//      Logic that resolves GraphQL fields
// ========================================================

const graphqlServer = new ApolloServer({
    typeDefs,
    resolvers,
});


// ========================================================
// Start and Mount GraphQL
// ========================================================
//
// This function:
//
// 1. Starts Apollo Server
// 2. Connects Apollo Server to our existing Express app
// 3. Creates the /graphql endpoint
// ========================================================

export const startGraphQLServer = async (app) => {

    // Apollo Server must be started before its
    // Express middleware can be used.
    await graphqlServer.start();

    // Mount GraphQL on our existing Express application.
    app.use(
        "/graphql",

        expressMiddleware(graphqlServer, {
            context: createGraphQLContext,
        })
    );

    console.log(
        "GraphQL server mounted at /graphql"
    );
};
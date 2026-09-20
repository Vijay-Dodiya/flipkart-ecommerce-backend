// ========================================================
// GRAPHQL CONTEXT
//
// Context is created for every GraphQL request.
//
// Later this will contain:
//
// - authenticated user
// - JWT information
// - authorization information
// - shared request-level utilities
//
// For now we keep it simple.
// ========================================================

export const createGraphQLContext = async ({ req }) => {

    return {
        user: req.user || null,
    };
};
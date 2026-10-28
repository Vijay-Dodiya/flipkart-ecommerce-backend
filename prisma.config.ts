// import "dotenv/config";
// import { defineConfig, env } from "prisma/config";

// export default defineConfig({
//     schema: "prisma/schema.prisma",

//     migrations: {
//         path: "prisma/migrations",
//     },

//     datasource: {
//         url: env("DATABASE_URL"),
//         shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
//     },
// });


import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use the direct Neon connection for migrations when available.
    // Fall back to DATABASE_URL for local development.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

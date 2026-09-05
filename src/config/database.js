import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

try {
    const result = await pool.query("SELECT NOW()");

    console.log("Database connected successfully!");
    console.log("Database time:", result.rows[0].now);
} catch (error) {
    console.error("Database connection failed:", error.message);
}

export default pool;
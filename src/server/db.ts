// Comments in English inside code as requested.
import { Pool } from "pg";

const connStr = process.env.DATABASE_URL!;
export const pool = new Pool({
  connectionString: connStr,
  // If provider enforces SSL, uncomment:
  // ssl: { rejectUnauthorized: false }
});

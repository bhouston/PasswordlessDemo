import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getEnvConfig } from "@/server/env";
import * as schema from "./schema";

const env = getEnvConfig();
const sqlite = new Database(env.DATABASE_URL);

export const db = drizzle(sqlite, { schema });

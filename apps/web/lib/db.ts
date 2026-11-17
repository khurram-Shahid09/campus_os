import "server-only";
import { createDb, type Db } from "@campusos/db";

const globalForDb = globalThis as unknown as { campusDb?: Db };

/** One pooled client per server process (survives dev hot reloads). Created on first use. */
export function getDb(): Db {
  globalForDb.campusDb ??= createDb();
  return globalForDb.campusDb;
}

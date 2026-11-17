import { sql } from "drizzle-orm";
import type { Db, Tx } from "../index";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` in a transaction that can only touch one school's rows: it switches to the `campusos_app` role
 * (subject to row-level security) and sets `app.school_id`. Every request in the working app goes through this.
 */
export async function withSchool<T>(db: Db, schoolId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(schoolId)) throw new Error("Invalid school id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role campusos_app`);
    await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
    return fn(tx);
  });
}

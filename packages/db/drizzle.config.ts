import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env yet: fine for `generate`, required for `migrate`
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});

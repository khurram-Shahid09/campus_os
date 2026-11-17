import type { NextConfig } from "next";
import path from "node:path";

// One .env at the repo root, shared by web, worker and db scripts. Optional (hosts set real env vars).
try {
  process.loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch {
  // no root .env: rely on the host environment
}

const nextConfig: NextConfig = {
  transpilePackages: ["@campusos/core", "@campusos/db", "@campusos/ai"],
  // phone screenshots are often 2-5 MB
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;

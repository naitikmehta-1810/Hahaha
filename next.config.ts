import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.28.80.162", "127.0.0.1", "localhost"],
  // Multiple package-lock.json files exist (root + backend + notification services).
  // Pin tracing to the app root so Next doesn't pick a sibling lockfile by accident.
  outputFileTracingRoot: root,
};

export default nextConfig;

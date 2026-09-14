import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Absolute API origin for SSR + rewrite proxy (not used in the browser). */
const backendOrigin = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.28.80.162", "127.0.0.1", "localhost"],
  // Multiple package-lock.json files exist (root + backend + notification services).
  // Pin tracing to the app root so Next doesn't pick a sibling lockfile by accident.
  outputFileTracingRoot: root,
  /**
   * Browser calls same-origin `/api/*` on stuffsy.app; Vercel proxies to Render.
   * That keeps auth cookies first-party (third-party cookies to onrender.com are blocked).
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

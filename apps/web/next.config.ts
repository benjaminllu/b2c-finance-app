import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@optima/core", "@optima/ui", "@optima/seed", "@optima/db"],
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  typedRoutes: false,
};

export default nextConfig;

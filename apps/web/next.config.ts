import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile local workspace packages (TypeScript sources, ESM)
  // @archivox/db is intentionally excluded: Prisma client requires a generated
  // .prisma/client at build time which is not available in preview deploys.
  transpilePackages: [
    "@archivox/core",
    "@archivox/engines",
    "@archivox/generator",
  ],
};

export default nextConfig;

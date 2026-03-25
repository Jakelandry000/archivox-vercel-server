import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile local workspace packages (TypeScript sources, ESM)
  transpilePackages: [
    "@archivox/db",
    "@archivox/core",
    "@archivox/engines",
    "@archivox/generator",
  ],
  // Treat Prisma + pg driver as server-side externals so Next.js doesn't bundle them.
  // @prisma/adapter-pg and pg use native bindings that break when bundled.
  serverExternalPackages: ["@prisma/client", "prisma", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;

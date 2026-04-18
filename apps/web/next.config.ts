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
  // Allow next/image to serve SVG files.
  // The CSP disables scripts inside the SVG to mitigate XSS risk.
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;

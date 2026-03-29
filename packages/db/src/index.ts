import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  // Prefer DIRECT_URL: driver adapters work better against a direct Neon endpoint
  // (PgBouncer pooler can reject prepared-statement protocol and channel_binding).
  // Fall back to DATABASE_URL if DIRECT_URL is not set.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "[archivox/db] Neither DIRECT_URL nor DATABASE_URL is set. " +
        "Copy .env.example to .env.local at the repo root and fill in your Neon credentials.",
    );
  }

  // Quick sanity-check: make sure the URL is at least parseable before handing
  // it to pg (avoids a confusing ECONNREFUSED to localhost:5432 when the var is
  // set to a placeholder value like "postgresql://USER:PASSWORD@...").
  try {
    const u = new URL(connectionString);
    if (!u.hostname || u.hostname === "localhost") {
      console.warn(
        "[archivox/db] WARNING: connection target is",
        u.hostname || "(empty)",
        "– expected a Neon host. Check DIRECT_URL / DATABASE_URL in .env.local.",
      );
    }
  } catch {
    throw new Error(
      "[archivox/db] DIRECT_URL / DATABASE_URL is not a valid URL. " +
        "Value starts with: " +
        connectionString.slice(0, 30) +
        "...",
    );
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    // pg picks up sslmode from the connection string; set ssl:true as a fallback
    // so it is never silently dropped on Node builds that strip query params.
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";

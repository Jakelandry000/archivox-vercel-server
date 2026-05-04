import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "[archivox/db] Neither DIRECT_URL nor DATABASE_URL is set.",
    );
  }

  try {
    const u = new URL(connectionString);
    if (!u.hostname || u.hostname === "localhost") {
      console.warn("[archivox/db] WARNING: connection target is", u.hostname || "(empty)");
    }
  } catch {
    throw new Error("[archivox/db] DIRECT_URL / DATABASE_URL is not a valid URL.");
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

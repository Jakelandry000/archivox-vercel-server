export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@archivox/db";

/** Parse a postgres URL and return safe diagnostic fields (no password). */
function parseDbUrl(raw: string | undefined): Record<string, string | number | null> {
  if (!raw) return { present: false, host: null, port: null, database: null, note: "env var not set" } as never;
  try {
    const u = new URL(raw);
    return {
      present: true,
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, "") || null,
      user: u.username || null,
      sslmode: u.searchParams.get("sslmode"),
      channelBinding: u.searchParams.get("channel_binding"),
    } as never;
  } catch {
    return { present: true, host: null, port: null, database: null, note: "URL parse failed" } as never;
  }
}

export async function GET() {
  const directUrl = process.env.DIRECT_URL;
  const databaseUrl = process.env.DATABASE_URL;
  const activeUrl = directUrl ?? databaseUrl;

  const diag = {
    DIRECT_URL: parseDbUrl(directUrl),
    DATABASE_URL: parseDbUrl(databaseUrl),
    active: directUrl ? "DIRECT_URL" : databaseUrl ? "DATABASE_URL" : "none",
    target: parseDbUrl(activeUrl),
  };

  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ ok: true, db: "up", latencyMs: Date.now() - start, diag });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const sanitized = message.replace(/postgresql:\/\/[^\s]*/gi, "[redacted]");
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 4).join("\n") : undefined;
    return NextResponse.json(
      { ok: false, db: "down", error: sanitized, code, diag, stack },
      { status: 503 },
    );
  }
}
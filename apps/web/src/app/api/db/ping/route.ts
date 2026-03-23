import { NextResponse } from "next/server";
import { prisma } from "@archivox/db";

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", latencyMs: Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // Strip connection-string credentials before returning
    const sanitized = message.replace(/postgresql:\/\/[^\s]*/gi, "[redacted]");
    return NextResponse.json(
      { ok: false, db: "down", error: sanitized },
      { status: 503 },
    );
  }
}
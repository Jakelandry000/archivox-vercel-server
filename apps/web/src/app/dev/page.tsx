/**
 * /dev — local-only status dashboard.
 * Server component: queries the DB directly so there is no extra HTTP hop.
 * Not linked from the main UI; visit manually at http://localhost:3000/dev
 */
import { prisma } from "@archivox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbResult =
  | { ok: true; latencyMs: number; userCount: number; floorPlanCount: number }
  | { ok: false; error: string };

async function checkDb(): Promise<DbResult> {
  try {
    const start = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    const latencyMs = Date.now() - start;
    const [userCount, floorPlanCount] = await Promise.all([
      prisma.user.count(),
      prisma.floorPlan.count(),
    ]);
    return { ok: true, latencyMs, userCount, floorPlanCount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return {
      ok: false,
      error: msg.replace(/postgresql:\/\/[^\s]*/gi, "[redacted]"),
    };
  }
}

export default async function DevPage() {
  const db = await checkDb();

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: "2rem",
        background: "#0a0a0a",
        color: "#e5e5e5",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ color: "#4ade80", marginBottom: "0.25rem" }}>
        ArchiVox — Dev Dashboard
      </h1>
      <p style={{ color: "#6b7280", marginBottom: "2rem", fontSize: "0.85rem" }}>
        Server-rendered · not linked from the main UI
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ color: "#a3e635", marginBottom: "0.5rem" }}>Database</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: "480px" }}>
          <tbody>
            <Row label="status">
              <span style={{ color: db.ok ? "#4ade80" : "#f87171" }}>
                {db.ok ? "up" : "down"}
              </span>
            </Row>
            {db.ok && (
              <>
                <Row label="latency">{db.latencyMs} ms</Row>
                <Row label="users">{db.userCount}</Row>
                <Row label="floor_plans">{db.floorPlanCount}</Row>
              </>
            )}
            {!db.ok && (
              <tr>
                <td colSpan={2}>
                  <pre
                    style={{
                      color: "#f87171",
                      background: "#1c1c1c",
                      padding: "0.75rem",
                      borderRadius: "4px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      fontSize: "0.8rem",
                    }}
                  >
                    {db.error}
                  </pre>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ color: "#a3e635", marginBottom: "0.5rem" }}>API Endpoints</h2>
        <ul style={{ listStyle: "none", padding: 0, lineHeight: "1.8" }}>
          <li>
            <a href="/api/db/ping" style={{ color: "#60a5fa" }}>
              GET /api/db/ping
            </a>{" "}
            — JSON healthcheck
          </li>
          <li>
            <a href="/api/demo-layout" style={{ color: "#60a5fa" }}>
              GET /api/demo-layout
            </a>{" "}
            — static layout demo
          </li>
          <li>
            <span style={{ color: "#9ca3af" }}>POST /api/chat</span> — layout
            generator (requires body)
          </li>
        </ul>
      </section>
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        style={{
          color: "#9ca3af",
          paddingRight: "1.5rem",
          paddingBottom: "0.25rem",
          verticalAlign: "top",
        }}
      >
        {label}
      </td>
      <td style={{ paddingBottom: "0.25rem" }}>{children}</td>
    </tr>
  );
}

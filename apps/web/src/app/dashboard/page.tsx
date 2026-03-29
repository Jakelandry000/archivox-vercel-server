import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';
import { ScrollShell } from '../components/ScrollShell';
import { LogoutButton } from '../components/LogoutButton';

// Stub project data — replace with DB query once projects table is wired up.
const STUB_PROJECTS = [
  { id: 'proj-1', name: '3BR Suburban Home', updatedAt: '2 hours ago', score: 91 },
  { id: 'proj-2', name: 'Modern Studio Apartment', updatedAt: 'Yesterday', score: 78 },
  { id: 'proj-3', name: 'Commercial Retail Unit', updatedAt: '3 days ago', score: 65 },
];

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? parseSession(token) : null;
  if (!session) redirect('/signin');

  return (
    <ScrollShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center">
              <div
                className="h-4 w-4 rounded-md"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))' }}
              />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">ArchiVox</h1>
              <p className="text-xs text-white/50">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-white/40">{session.user.email}</span>
            <LogoutButton />
          </div>
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white/90">Projects</h2>
          <Link href="/generator" className="btn btn-primary text-xs px-4 py-2">
            + New Project
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          {STUB_PROJECTS.map((p) => (
            <div
              key={p.id}
              className="glass rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
            >
              <div>
                <div className="text-sm font-medium text-white/90">{p.name}</div>
                <div className="mt-0.5 text-xs text-white/45">Updated {p.updatedAt}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div
                    className={`text-sm font-semibold tabular-nums ${
                      p.score >= 85
                        ? 'text-emerald-400'
                        : p.score >= 70
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }`}
                  >
                    {p.score}
                  </div>
                  <div className="text-[10px] text-white/40">score</div>
                </div>
                <Link href="/generator" className="btn btn-ghost text-xs px-3 py-1.5">
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-10 text-xs text-white/30">
          © {new Date().getFullYear()} ArchiVox
        </footer>
      </div>
    </ScrollShell>
  );
}

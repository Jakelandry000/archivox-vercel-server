import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';
import { ScrollShell } from '../components/ScrollShell';
import { LogoutButton } from '../components/LogoutButton';
import { ProjectsPanel } from '../components/ProjectsPanel';

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
          <Link href="/projects/new" className="btn btn-primary text-xs px-4 py-2">
            + New Project
          </Link>
        </div>

        <ProjectsPanel userId={session.user.id} />

        <footer className="mt-10 text-xs text-white/30">
          © {new Date().getFullYear()} ArchiVox
        </footer>
      </div>
    </ScrollShell>
  );
}

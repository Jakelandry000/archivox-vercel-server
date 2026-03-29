import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';
import { NewProjectForm } from './NewProjectForm';
import { ScrollShell } from '../../components/ScrollShell';
import Link from 'next/link';

export default async function NewProjectPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? parseSession(token) : null;
  if (!session) redirect('/signin?next=/projects/new');

  return (
    <ScrollShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/dashboard"
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            ← Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-sm text-white/60">New Project</span>
        </div>

        <h1 className="text-xl font-semibold text-white/90 mb-6">Create Project</h1>

        <NewProjectForm userId={session.user.id} />
      </div>
    </ScrollShell>
  );
}

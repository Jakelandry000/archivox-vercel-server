import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';
import { ScrollShell } from '../../components/ScrollShell';
import { ProjectDetail } from './ProjectDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? parseSession(token) : null;
  if (!session) redirect(`/signin?next=/projects/${id}`);

  return (
    <ScrollShell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/dashboard"
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            ← Dashboard
          </Link>
        </div>
        <ProjectDetail userId={session.user.id} projectId={id} />
      </div>
    </ScrollShell>
  );
}

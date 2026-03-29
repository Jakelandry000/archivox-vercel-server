'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, deleteProject } from '@/lib/projects/store';
import type { Project } from '@/lib/projects/types';
import Link from 'next/link';

interface Props {
  userId: string;
  projectId: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectDetail({ userId, projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    const found = getProjects(userId).find((p) => p.id === projectId) ?? null;
    setProject(found);
  }, [userId, projectId]);

  if (project === undefined) {
    return <div className="glass rounded-2xl px-6 py-10 animate-pulse opacity-40 h-40" />;
  }

  if (project === null) {
    return (
      <div className="glass rounded-2xl px-6 py-10 text-center">
        <p className="text-white/40 text-sm mb-4">Project not found.</p>
        <Link href="/dashboard" className="btn btn-ghost text-xs px-4 py-2">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  function handleDelete() {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    deleteProject(userId, projectId);
    router.push('/dashboard');
  }

  const hasDimensions = project.siteWidth && project.siteDepth;
  const area = hasDimensions
    ? project.siteWidth! * project.siteDepth!
    : project.overallSqft;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-white/90">{project.name}</h1>
        <button
          onClick={handleDelete}
          className="text-white/25 hover:text-red-400 transition-colors text-xs px-2 py-1 shrink-0"
        >
          Delete
        </button>
      </div>

      {project.description && (
        <p className="text-sm text-white/60">{project.description}</p>
      )}

      <div className="glass rounded-2xl px-5 py-4 grid grid-cols-2 gap-4">
        {hasDimensions && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
              Dimensions
            </div>
            <div className="text-sm text-white/80">
              {project.siteWidth}′ × {project.siteDepth}′
            </div>
          </div>
        )}
        {area && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
              Area
            </div>
            <div className="text-sm text-white/80">{area.toLocaleString()} sqft</div>
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">Created</div>
          <div className="text-sm text-white/80">{formatDate(project.createdAt)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">Updated</div>
          <div className="text-sm text-white/80">{formatDate(project.updatedAt)}</div>
        </div>
      </div>

      {project.program && (
        <div className="glass rounded-2xl px-5 py-4">
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-2">Program</div>
          <p className="text-sm text-white/70 whitespace-pre-wrap">{project.program}</p>
        </div>
      )}

      <div className="pt-2">
        <Link href="/generator" className="btn btn-primary text-sm px-6 py-2.5">
          Open in Generator
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProjects, deleteProject } from '@/lib/projects/store';
import type { Project } from '@/lib/projects/types';

interface Props {
  userId: string;
}

function formatDate(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function sqftLabel(p: Project): string | null {
  if (p.overallSqft) return `${p.overallSqft.toLocaleString()} sqft`;
  if (p.siteWidth && p.siteDepth)
    return `${p.siteWidth}′ × ${p.siteDepth}′ (${(p.siteWidth * p.siteDepth).toLocaleString()} sqft)`;
  return null;
}

export function ProjectsPanel({ userId }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    setProjects(getProjects(userId));
  }, [userId]);

  function handleDelete(id: string) {
    deleteProject(userId, id);
    setProjects(getProjects(userId));
  }

  // Loading skeleton — avoids hydration flash
  if (projects === null) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="glass rounded-2xl px-5 py-4 h-16 animate-pulse opacity-40" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="glass rounded-2xl px-6 py-10 text-center">
        <p className="text-white/40 text-sm mb-4">No projects yet.</p>
        <Link href="/projects/new" className="btn btn-primary text-xs px-5 py-2">
          Create your first project
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {projects.map((p) => {
        const area = sqftLabel(p);
        return (
          <div
            key={p.id}
            className="glass rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-white/90 truncate">{p.name}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40">
                <span>Updated {formatDate(p.updatedAt)}</span>
                {area && <span>{area}</span>}
              </div>
              {p.description && (
                <div className="mt-1 text-xs text-white/30 line-clamp-1">{p.description}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/projects/${p.id}`}
                className="btn btn-ghost text-xs px-3 py-1.5"
              >
                Open
              </Link>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-white/25 hover:text-red-400 transition-colors text-xs px-2 py-1.5"
                aria-label="Delete project"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

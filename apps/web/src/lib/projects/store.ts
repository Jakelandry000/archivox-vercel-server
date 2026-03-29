/**
 * v0 local-only project persistence via localStorage.
 *
 * TODO(db): replace the three functions below with fetch() calls to
 *   /api/projects (POST, GET, PATCH) backed by a DB once the projects
 *   table is wired up. The call-sites won't need to change.
 */
import type { Project } from './types';

function storageKey(userId: string): string {
  return `av_projects_${userId}`;
}

/** Returns all projects for the given user, newest first. */
export function getProjects(userId: string): Project[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: Project[] = raw ? JSON.parse(raw) : [];
    return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Upserts a project (insert if new id, update if existing). */
export function saveProject(userId: string, project: Project): void {
  const existing = getProjects(userId);
  const idx = existing.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    existing[idx] = project;
  } else {
    existing.push(project);
  }
  localStorage.setItem(storageKey(userId), JSON.stringify(existing));
}

/** Removes a project by id. */
export function deleteProject(userId: string, id: string): void {
  const existing = getProjects(userId).filter((p) => p.id !== id);
  localStorage.setItem(storageKey(userId), JSON.stringify(existing));
}

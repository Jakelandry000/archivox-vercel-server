'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveProject } from '@/lib/projects/store';
import type { Project } from '@/lib/projects/types';

interface Props {
  userId: string;
}

type DimMode = 'dimensions' | 'sqft';

export function NewProjectForm({ userId }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dimMode, setDimMode] = useState<DimMode>('dimensions');
  const [siteWidth, setSiteWidth] = useState('');
  const [siteDepth, setSiteDepth] = useState('');
  const [overallSqft, setOverallSqft] = useState('');
  const [program, setProgram] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return 'Project name is required.';
    if (dimMode === 'dimensions') {
      if ((siteWidth && !siteDepth) || (!siteWidth && siteDepth))
        return 'Enter both width and depth, or leave both blank.';
      if (siteWidth && isNaN(Number(siteWidth))) return 'Site width must be a number.';
      if (siteDepth && isNaN(Number(siteDepth))) return 'Site depth must be a number.';
    } else {
      if (overallSqft && isNaN(Number(overallSqft))) return 'Square footage must be a number.';
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSaving(true);

    const now = Date.now();
    const project: Project = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
    };

    if (description.trim()) project.description = description.trim();
    if (program.trim()) project.program = program.trim();

    if (dimMode === 'dimensions') {
      if (siteWidth) project.siteWidth = Number(siteWidth);
      if (siteDepth) project.siteDepth = Number(siteDepth);
    } else {
      if (overallSqft) project.overallSqft = Number(overallSqft);
    }

    saveProject(userId, project);
    router.push('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-white/60 mb-1.5">
          Project name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 3BR Suburban Home"
          className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent"
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-white/60 mb-1.5">
          Notes <span className="text-white/30">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description or notes about this project…"
          rows={2}
          className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent resize-none"
        />
      </div>

      {/* Site size */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-white/60">
            Site size <span className="text-white/30">(optional)</span>
          </label>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setDimMode('dimensions')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                dimMode === 'dimensions'
                  ? 'bg-emerald-600/40 text-emerald-300'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              W × D
            </button>
            <button
              type="button"
              onClick={() => setDimMode('sqft')}
              className={`px-3 py-1 rounded-lg transition-colors ${
                dimMode === 'sqft'
                  ? 'bg-emerald-600/40 text-emerald-300'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Sqft
            </button>
          </div>
        </div>

        {dimMode === 'dimensions' ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="number"
                value={siteWidth}
                onChange={(e) => setSiteWidth(e.target.value)}
                placeholder="Width (ft)"
                min={0}
                className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent"
              />
            </div>
            <span className="self-center text-white/30 text-sm">×</span>
            <div className="flex-1">
              <input
                type="number"
                value={siteDepth}
                onChange={(e) => setSiteDepth(e.target.value)}
                placeholder="Depth (ft)"
                min={0}
                className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent"
              />
            </div>
          </div>
        ) : (
          <input
            type="number"
            value={overallSqft}
            onChange={(e) => setOverallSqft(e.target.value)}
            placeholder="Total square footage"
            min={0}
            className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent"
          />
        )}
      </div>

      {/* Program */}
      <div>
        <label className="block text-xs font-medium text-white/60 mb-1.5">
          Program brief <span className="text-white/30">(optional)</span>
        </label>
        <textarea
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          placeholder="e.g. 3 bedrooms, 2 bathrooms, open-plan kitchen, attached 2-car garage…"
          rows={3}
          className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:ring-1 focus:ring-emerald-500/60 bg-transparent resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn btn-primary px-6 py-2.5 text-sm">
          {saving ? 'Saving…' : 'Create Project'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="btn btn-ghost px-4 py-2.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

import { NextResponse } from 'next/server';
import { prisma } from '@archivox/db';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim().slice(0, 2000);

  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  // For PR#1 we just store the prompt as a Run record.
  // Later PRs will attach layout/svg/scr blob URLs.
  const run = await prisma.run.create({
    data: {
      projectId,
      prompt,
      status: 'COMPLETE'
    }
  });

  return NextResponse.json({ run });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params;

  const runs = await prisma.run.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  return NextResponse.json({ runs });
}

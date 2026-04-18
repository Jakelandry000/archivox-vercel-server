import { NextResponse } from 'next/server';
import { prisma } from '@archivox/db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 120);

  if (!name) {
    return NextResponse.json({ error: 'Missing name' }, { status: 400 });
  }

  const project = await prisma.project.create({ data: { name } });
  return NextResponse.json({ project });
}

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return NextResponse.json({ projects });
}

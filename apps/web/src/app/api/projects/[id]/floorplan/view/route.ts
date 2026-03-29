import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  const session = rawToken ? parseSession(rawToken) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { searchParams } = new URL(req.url);
  const blobUrl = searchParams.get('url');

  if (!blobUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Security: verify this blob belongs to the authenticated user and this project.
  // Blob pathnames are structured as: floorplans/{userId}/{projectId}/{filename}
  let parsedPathname: string;
  try {
    parsedPathname = new URL(blobUrl).pathname.slice(1); // strip leading slash
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }

  const expectedPrefix = `floorplans/${session.user.id}/${projectId}/`;
  if (!parsedPathname.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(blobUrl, { access: 'private' });
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 502 });
  }

  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const filename = parsedPathname.split('/').pop() ?? 'file';

  return new Response(result.stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

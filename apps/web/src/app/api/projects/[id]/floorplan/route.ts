import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Params) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? parseSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only PDF, PNG, and JPEG files are accepted' },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 });
  }

  // Scoped pathname: userId/projectId/filename (sanitised)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathname = `floorplans/${session.user.id}/${projectId}/${safeName}`;

  try {
    const blob = await put(pathname, file, { access: 'public' });

    return NextResponse.json({
      blobUrl: blob.url,
      filename: file.name,
      uploadedAt: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Common cause in Preview/Prod: missing/invalid `BLOB_READ_WRITE_TOKEN`.
    return NextResponse.json(
      {
        error: 'Blob upload failed',
        detail: message,
        hint: 'Verify BLOB_READ_WRITE_TOKEN is set for this environment and redeploy the preview.',
      },
      { status: 500 },
    );
  }
}

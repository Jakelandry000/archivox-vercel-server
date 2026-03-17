import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const batchId = url.searchParams.get('batchId') ?? '';

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
  }

  // NOTE: We keep this server-side so blobs can remain private.
  const manifestPathname = `ingest/${batchId}/manifest.json`;

  try {
    const res = await get(manifestPathname, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    if (!res) throw new Error('Blob get() returned null');
    const json = await new Response(res.stream).json();
    return NextResponse.json(json);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Could not load manifest for batchId=${batchId}: ${msg}`, manifestPathname },
      { status: 404 }
    );
  }
}

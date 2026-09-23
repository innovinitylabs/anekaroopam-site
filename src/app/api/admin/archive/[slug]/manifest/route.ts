import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { writeAccessionManifest } from "@/lib/archive/manifest";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const entry = await loadArchiveEntry(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }
    const manifest = await writeAccessionManifest(entry);
    return NextResponse.json({ manifest });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Manifest rebuild failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { saveArchiveEntry } from "@/lib/archive/draft-store";
import { ArchiveEntrySchema, ProvenanceRecordSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const entry = await loadArchiveEntry(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }

    const provenance = ProvenanceRecordSchema.parse(await request.json());
    const updated = ArchiveEntrySchema.parse({
      ...entry,
      provenance,
      updatedAt: new Date().toISOString(),
    });
    await saveArchiveEntry(updated);
    return NextResponse.json({ entry: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Provenance update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { saveArchiveEntry } from "@/lib/archive/draft-store";
import { ArchiveMetadataFieldsSchema, ArchiveEntrySchema } from "@/lib/archive/schema";

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

    const metadata = ArchiveMetadataFieldsSchema.parse(await request.json());
    const updated = ArchiveEntrySchema.parse({
      ...entry,
      metadata: {
        ...metadata,
        accessionId: entry.metadata.accessionId ?? entry.accessionId,
      },
      updatedAt: new Date().toISOString(),
    });
    await saveArchiveEntry(updated);
    return NextResponse.json({ entry: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Metadata update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  loadArchiveEntryDurable,
  saveArchiveEntryOnGitHub,
} from "@/lib/archive/draft-github-store";
import { saveArchiveEntry } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { ArchiveMetadataFieldsSchema, ArchiveEntrySchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const entry = await loadArchiveEntryDurable(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Metadata load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const entry = await loadArchiveEntryDurable(slug);
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
    if (githubStorageAvailable()) {
      await saveArchiveEntryOnGitHub(updated, `archive: metadata ${slug}`);
    } else {
      await saveArchiveEntry(updated);
    }
    return NextResponse.json({ entry: updated });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Metadata update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

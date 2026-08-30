import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  ArchiveEntrySchema,
  ProvenanceRecordSchema,
} from "@/lib/archive/schema";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { contentArchiveDir } from "@/lib/archive/paths";
import { getGitHubArchiveConfig } from "@/lib/github/types";
import { updateArchiveProvenanceOnGitHub } from "@/lib/github/publish-entry";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      slug?: string;
      provenance?: unknown;
    };
    if (!body.slug?.trim()) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const slug = body.slug.trim();
    const provenance = ProvenanceRecordSchema.parse(body.provenance ?? {});

    const entry = await loadArchiveEntry(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }

    const updated = ArchiveEntrySchema.parse({
      ...entry,
      provenance,
      updatedAt: new Date().toISOString(),
    });

    const metadataJson = JSON.stringify(updated, null, 2);
    const metaPath = path.join(contentArchiveDir(slug), "metadata.json");
    await fs.writeFile(metaPath, metadataJson);

    let commitSha: string | undefined;
    if (getGitHubArchiveConfig()) {
      const gh = await updateArchiveProvenanceOnGitHub(slug, metadataJson);
      commitSha = gh.commitSha;
    }

    return NextResponse.json({ slug, commitSha });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Provenance update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

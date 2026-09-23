import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  githubStorageAvailable,
  loadArchiveEntryDurable,
  saveArchiveEntryOnGitHub,
} from "@/lib/archive/draft-github-store";
import { saveArchiveEntry } from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { ArchiveEntrySchema, ProvenanceRecordSchema } from "@/lib/archive/schema";
import { getGitHubArchiveConfig } from "@/lib/github/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const durable = githubStorageAvailable();
    if (durable && !getGitHubArchiveConfig()) {
      return NextResponse.json(
        {
          error:
            "GitHub not configured. Set GITHUB_ARCHIVE_TOKEN, GITHUB_ARCHIVE_OWNER, and GITHUB_ARCHIVE_REPO.",
        },
        { status: 503 },
      );
    }

    const entry = await loadArchiveEntryDurable(slug);
    if (!entry) {
      return NextResponse.json({ error: "Archive entry not found" }, { status: 404 });
    }

    const provenance = ProvenanceRecordSchema.parse(await request.json());
    const updated = ArchiveEntrySchema.parse({
      ...entry,
      provenance,
      updatedAt: new Date().toISOString(),
    });

    if (durable) {
      const saved = await saveArchiveEntryOnGitHub(
        updated,
        `archive: provenance ${slug}`,
      );
      try {
        await saveArchiveEntry(saved.entry);
      } catch {
        /* deploy FS may be read-only */
      }
      return NextResponse.json({
        entry: saved.entry,
        commitSha: saved.commitSha,
      });
    }

    const saved = await saveArchiveEntry(updated);
    return NextResponse.json({ entry: saved });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Provenance update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

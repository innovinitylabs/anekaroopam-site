import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  buildArchiveVisibilityUpdate,
  saveArchiveEntry,
} from "@/lib/archive/draft-store";
import {
  githubStorageAvailable,
  loadArchiveEntryDurable,
} from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { assertSlugAllowed } from "@/lib/archive/redirects";
import { DraftStatusSchema } from "@/lib/archive/schema";
import { assertVisibilityTransition } from "@/lib/archive/visibility";
import { syncArchiveVisibilityToGitHub } from "@/lib/github/publish-entry";
import { getGitHubArchiveConfig } from "@/lib/github/types";

export const runtime = "nodejs";

const VisibilityBodySchema = z.object({
  status: DraftStatusSchema,
});

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug: rawSlug } = await params;
    const slug = assertSlugAllowed(rawSlug);
    const body = VisibilityBodySchema.parse(await request.json());
    if (!["published", "minted", "hidden", "withdrawn"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid archive visibility status" }, { status: 400 });
    }

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
      return NextResponse.json({ error: `Archive entry not found: ${slug}` }, { status: 404 });
    }

    assertVisibilityTransition(entry, body.status);
    const updated = buildArchiveVisibilityUpdate(entry, body.status);
    const metadataJson = `${JSON.stringify(updated, null, 2)}\n`;

    let commitSha: string | undefined;
    let githubSynced = false;

    if (getGitHubArchiveConfig()) {
      const gh = await syncArchiveVisibilityToGitHub(
        slug,
        metadataJson,
        entry.status,
        body.status,
      );
      commitSha = gh.commitSha;
      githubSynced = true;
    }

    if (durable) {
      // GitHub tip is authoritative; local mirror is best-effort only.
      try {
        await saveArchiveEntry(updated);
      } catch {
        /* deploy FS may be read-only */
      }
      return NextResponse.json({
        entry: updated,
        commitSha,
        githubSynced,
      });
    }

    const saved = await saveArchiveEntry(updated);
    return NextResponse.json({
      entry: saved,
      commitSha,
      githubSynced,
    });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "Visibility update failed";
    if (message.includes("Archive entry not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (
      message.includes("Slug is reserved") ||
      message.includes("Slug cannot be empty") ||
      message.includes("Invalid visibility") ||
      message.includes("Invalid archive visibility") ||
      message.includes("already") ||
      message.includes("Cannot hide")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

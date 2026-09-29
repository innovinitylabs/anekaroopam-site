import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { assertArchiveDiscardable } from "@/lib/archive/archive-policy";
import {
  discardGeneratedArchiveOnGitHub,
  githubStorageAvailable,
  loadArchiveEntryDurable,
} from "@/lib/archive/draft-github-store";
import {
  ArchiveDiscardConfirmationError,
  ArchiveDiscardNotFoundError,
  discardGeneratedArchive,
} from "@/lib/archive/draft-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { assertSlugAllowed } from "@/lib/archive/redirects";

export const runtime = "nodejs";

const DiscardBodySchema = z.object({
  confirmation: z.string(),
});

type Context = { params: Promise<{ slug: string }> };

export async function DELETE(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug: rawSlug } = await params;
    const normalized = assertSlugAllowed(rawSlug);
    const body = DiscardBodySchema.parse(await request.json());

    const entry = await loadArchiveEntryDurable(normalized);
    if (!entry) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }

    try {
      assertArchiveDiscardable(entry);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Archive is not discardable";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    if (body.confirmation !== entry.slug) {
      return NextResponse.json(
        { error: "Discard requires exact slug confirmation." },
        { status: 400 },
      );
    }

    const discarded = githubStorageAvailable()
      ? await discardGeneratedArchiveOnGitHub(entry.slug, body.confirmation)
      : await discardGeneratedArchive(entry.slug, body.confirmation);
    return NextResponse.json({ ok: true, discarded });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    if (e instanceof ArchiveDiscardNotFoundError) {
      return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    }
    if (e instanceof ArchiveDiscardConfirmationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Discard failed";
    const status = /not discardable/i.test(message)
      ? 409
      : /slug|reserved|empty/i.test(message)
        ? 400
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

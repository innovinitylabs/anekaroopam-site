import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { archiveEntryToAccessionDraft } from "@/lib/archive/adapters";
import {
  loadDraftForPublishedSlug,
  resolveRegenerateSource,
} from "@/lib/archive/draft-store";
import { runArchiveExport } from "@/lib/archive/export-orchestrator";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { ArchiveDraftSchema } from "@/lib/archive/schema";
import { assertArchiveRegenerable } from "@/lib/archive/visibility";

export const runtime = "nodejs";

function exportErrorStatus(message: string): number {
  if (
    message.startsWith("source_required") ||
    message.includes("withdrawn and cannot be regenerated")
  ) {
    return 409;
  }
  return 500;
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const source = form.get("source");
    const draftRaw = form.get("draft");

    if (!(source instanceof File)) {
      return NextResponse.json({ error: "Missing source file" }, { status: 400 });
    }
    if (typeof draftRaw !== "string") {
      return NextResponse.json({ error: "Missing draft JSON" }, { status: 400 });
    }

    const draftJson = JSON.parse(draftRaw) as unknown;
    const draft = ArchiveDraftSchema.parse(draftJson);

    const existingEntry = await loadArchiveEntry(draft.slug);

    let sourceBuffer: Buffer;
    let resolvedSource:
      | Awaited<ReturnType<typeof resolveRegenerateSource>>["source"]
      | undefined;

    if (existingEntry) {
      assertArchiveRegenerable(existingEntry);
      const accessionDraft =
        (await loadDraftForPublishedSlug(draft.slug)) ??
        archiveEntryToAccessionDraft(existingEntry);
      const resolved = await resolveRegenerateSource(accessionDraft, existingEntry);
      sourceBuffer = resolved.sourceBuffer;
      resolvedSource = resolved.source;
    } else {
      sourceBuffer = Buffer.from(await source.arrayBuffer());
    }

    const result = await runArchiveExport({
      draft,
      sourceBuffer,
      existingEntry: existingEntry ?? undefined,
      source: resolvedSource,
    });

    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json(
      { error: message },
      { status: exportErrorStatus(message) },
    );
  }
}

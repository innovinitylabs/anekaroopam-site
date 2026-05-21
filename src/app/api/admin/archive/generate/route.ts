import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { ArchiveDraftSchema } from "@/lib/archive/schema";
import { runArchiveExport } from "@/lib/archive/export-orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

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
    const sourceBuffer = Buffer.from(await source.arrayBuffer());

    const result = await runArchiveExport({ draft, sourceBuffer });

    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

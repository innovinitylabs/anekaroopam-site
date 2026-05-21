import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { regenerateArchiveDerivatives } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

export async function POST(_request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { draftId } = await params;
    const result = await regenerateArchiveDerivatives(draftId);
    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Regeneration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

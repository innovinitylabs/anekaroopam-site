import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { generateArchiveFromDraft } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ draftId: string }> };

function generateErrorStatus(message: string): number {
  if (message.includes("withdrawn and cannot be regenerated")) {
    return 409;
  }
  if (message.includes("Draft not found")) {
    return 404;
  }
  return 500;
}

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { draftId } = await params;
    const result = await generateArchiveFromDraft(draftId);
    return NextResponse.json({
      slug: result.slug,
      files: result.files,
      warnings: result.warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json(
      { error: message },
      { status: generateErrorStatus(message) },
    );
  }
}

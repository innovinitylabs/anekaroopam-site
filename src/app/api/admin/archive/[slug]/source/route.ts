import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  ArchiveSourceImmutableError,
  storeArchiveSource,
} from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

function sourceErrorStatus(e: unknown): number {
  if (e instanceof ArchiveSourceImmutableError) return 409;
  if (e instanceof Error && e.message.includes("Archive entry not found")) {
    return 404;
  }
  return 500;
}

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const form = await request.formData();
    const source = form.get("source");
    if (!(source instanceof File)) {
      return NextResponse.json({ error: "Missing source file" }, { status: 400 });
    }

    const entry = await storeArchiveSource(slug, source);
    return NextResponse.json({ entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Source deposit failed";
    return NextResponse.json(
      { error: message },
      { status: sourceErrorStatus(e) },
    );
  }
}

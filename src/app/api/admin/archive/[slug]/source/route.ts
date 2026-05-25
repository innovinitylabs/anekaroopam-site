import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { storeArchiveSource } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

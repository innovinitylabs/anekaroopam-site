import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { renamePublishedArchiveSlug } from "@/lib/archive/draft-store";
import { SlugUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const input = SlugUpdateSchema.parse(await request.json());
    const entry = await renamePublishedArchiveSlug(slug, input.slug);
    return NextResponse.json({ entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Slug rename failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

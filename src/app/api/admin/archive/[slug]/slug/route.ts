import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { renamePublishedArchiveSlug } from "@/lib/archive/draft-store";
import { SlugUpdateSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

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

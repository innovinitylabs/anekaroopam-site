import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { hydrateDraftFromArchiveSlug } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const draft = await hydrateDraftFromArchiveSlug(slug);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft hydration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

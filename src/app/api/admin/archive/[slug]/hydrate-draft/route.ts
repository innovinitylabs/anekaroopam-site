import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { hydrateDraftFromArchiveSlug } from "@/lib/archive/draft-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const draft = await hydrateDraftFromArchiveSlug(slug);
    return NextResponse.json({ draft });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft hydration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

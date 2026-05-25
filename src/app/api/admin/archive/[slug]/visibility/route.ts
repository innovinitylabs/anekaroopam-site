import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { updateArchiveVisibility } from "@/lib/archive/draft-store";
import { DraftStatusSchema } from "@/lib/archive/schema";

export const runtime = "nodejs";

const VisibilityBodySchema = z.object({
  status: DraftStatusSchema,
});

type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const body = VisibilityBodySchema.parse(await request.json());
    if (!["published", "minted", "hidden", "withdrawn"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid archive visibility status" }, { status: 400 });
    }
    const entry = await updateArchiveVisibility(slug, body.status);
    return NextResponse.json({ entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Visibility update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

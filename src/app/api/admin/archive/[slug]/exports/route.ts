import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { exportMintPackage } from "@/lib/archive/mint-package";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const result = await exportMintPackage(slug);
    return NextResponse.json({
      packageDir: result.packageDir,
      exports: result.exports,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export rebuild failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

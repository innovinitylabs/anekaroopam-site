import { NextResponse } from "next/server";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { exportMintPackage } from "@/lib/archive/mint-package";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(_request: Request, { params }: Context) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  try {
    const { slug } = await params;
    const result = await exportMintPackage(slug);
    return NextResponse.json({
      packageDir: result.packageDir,
      exports: result.exports,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mint package export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

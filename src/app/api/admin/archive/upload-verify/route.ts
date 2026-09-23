import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { r2ArchiveReady } from "@/lib/r2/config";
import { isAllowedArchiveObjectKey } from "@/lib/r2/object-keys";
import { verifyR2Objects } from "@/lib/r2/verify";

export const runtime = "nodejs";

interface VerifyBody {
  accessionId?: string;
  revision?: number;
  objects?: Array<{
    key: string;
    contentType: string;
    contentLength: number;
  }>;
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!r2ArchiveReady()) {
    return NextResponse.json(
      { error: "R2 archive storage is not enabled or configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as VerifyBody;
    const accessionId = String(body.accessionId ?? "").trim();
    const revision = Number(body.revision);
    const objects = body.objects ?? [];

    if (!accessionId || !Number.isInteger(revision) || revision < 1) {
      return NextResponse.json(
        { error: "accessionId and revision are required" },
        { status: 400 },
      );
    }
    if (objects.length < 1 || objects.length > 16) {
      return NextResponse.json(
        { error: "objects must contain 1–16 entries" },
        { status: 400 },
      );
    }

    for (const obj of objects) {
      if (!isAllowedArchiveObjectKey(obj.key, accessionId, revision)) {
        return NextResponse.json(
          { error: `Unauthorized object key: ${obj.key}` },
          { status: 400 },
        );
      }
    }

    const result = await verifyR2Objects(objects);
    return NextResponse.json(
      {
        ok: result.ok,
        results: result.results,
        error: result.ok
          ? undefined
          : "One or more uploaded objects failed verification",
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload-verify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

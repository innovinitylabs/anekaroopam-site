import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import {
  assertAllowedMetadataCommitPaths,
  normalizeMetadataCommitPath,
} from "@/lib/archive/metadata-commit-paths";
import { commitFiles } from "@/lib/github/git-commit";
import { r2ArchiveReady } from "@/lib/r2/config";

export const runtime = "nodejs";

interface MetadataCommitBody {
  slug?: string;
  draftId?: string;
  message?: string;
  textFiles?: Array<{ path: string; content: string }>;
}

export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!githubStorageAvailable()) {
    return NextResponse.json(
      { error: "Durable GitHub storage is required for metadata-commit." },
      { status: 503 },
    );
  }
  if (!r2ArchiveReady()) {
    return NextResponse.json(
      { error: "R2 archive storage is not enabled or configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as MetadataCommitBody;
    const slug = String(body.slug ?? "").trim();
    const draftId =
      typeof body.draftId === "string" && body.draftId.trim()
        ? body.draftId.trim()
        : undefined;
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : `archive: metadata ${slug || "unknown"}`;
    const textFiles = body.textFiles ?? [];

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const upserts = textFiles.map((file) => ({
      path: normalizeMetadataCommitPath(file.path),
      content: Buffer.from(file.content, "utf8"),
    }));

    try {
      assertAllowedMetadataCommitPaths(
        upserts.map((f) => f.path),
        { slug, draftId },
      );
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Illegal metadata-commit paths";
      return NextResponse.json({ error: messageText }, { status: 400 });
    }

    const result = await commitFiles({ message, upserts });
    return NextResponse.json({
      commitSha: result.commitSha,
      paths: result.paths,
      slug,
      draftId: draftId ?? null,
    });
  } catch (e) {
    const github = githubErrorResponse(e);
    if (github) return github;
    const message = e instanceof Error ? e.message : "metadata-commit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

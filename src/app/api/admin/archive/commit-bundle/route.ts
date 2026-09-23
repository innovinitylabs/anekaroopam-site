import { NextResponse } from "next/server";
import { requireAdminIngest } from "@/lib/archive/admin-ingest-response";
import {
  assertAllowedCommitBundlePaths,
  MAX_COMMIT_BUNDLE_BYTES,
  normalizeCommitBundlePath,
} from "@/lib/archive/commit-bundle-paths";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { githubErrorResponse } from "@/lib/archive/github-admin-response";
import { commitFiles } from "@/lib/github/git-commit";

export const runtime = "nodejs";

/**
 * Browser-first archive commit: accepts pre-built files (no Sharp).
 * Durable GitHub storage required on Vercel/Preview.
 */
export async function POST(request: Request) {
  const denied = requireAdminIngest(request);
  if (denied) return denied;

  if (!githubStorageAvailable()) {
    return NextResponse.json(
      {
        error:
          "Durable GitHub storage is required for commit-bundle. Set GITHUB_ARCHIVE_DURABLE=1 locally or deploy on Vercel with archive GitHub credentials.",
      },
      { status: 503 },
    );
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "multipart/form-data required" },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const slug = String(form.get("slug") ?? "").trim();
    const draftIdRaw = form.get("draftId");
    const draftId =
      typeof draftIdRaw === "string" && draftIdRaw.trim()
        ? draftIdRaw.trim()
        : undefined;
    const messageRaw = form.get("message");
    const message =
      typeof messageRaw === "string" && messageRaw.trim()
        ? messageRaw.trim()
        : `archive: commit-bundle ${slug || "unknown"}`;

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const upserts: { path: string; content: Buffer }[] = [];
    let totalBytes = 0;

    for (const [key, value] of form.entries()) {
      if (key === "slug" || key === "draftId" || key === "message") continue;

      let repoPath: string;
      let bytes: Buffer;

      if (key === "file" || key === "files") {
        if (!(value instanceof File)) {
          return NextResponse.json(
            { error: "file parts must include a File with filename = repo path" },
            { status: 400 },
          );
        }
        repoPath = normalizeCommitBundlePath(value.name);
        bytes = Buffer.from(await value.arrayBuffer());
      } else if (key.startsWith("path:")) {
        repoPath = normalizeCommitBundlePath(key.slice("path:".length));
        if (typeof value === "string") {
          bytes = Buffer.from(value, "utf8");
        } else if (value instanceof File) {
          bytes = Buffer.from(await value.arrayBuffer());
        } else {
          return NextResponse.json(
            { error: `Unsupported form value for ${key}` },
            { status: 400 },
          );
        }
      } else {
        continue;
      }

      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_COMMIT_BUNDLE_BYTES) {
        return NextResponse.json(
          { error: "commit-bundle payload too large" },
          { status: 413 },
        );
      }
      upserts.push({ path: repoPath, content: bytes });
    }

    try {
      assertAllowedCommitBundlePaths(
        upserts.map((f) => f.path),
        { slug, draftId },
      );
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Illegal commit-bundle paths";
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
    const message = e instanceof Error ? e.message : "commit-bundle failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

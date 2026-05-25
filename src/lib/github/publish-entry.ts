import fs from "fs/promises";
import path from "path";
import { requireArchiveOctokit } from "./client";
import { contentArchiveDir, publicArchiveDir } from "@/lib/archive/paths";

async function collectFiles(dir: string, prefix: string): Promise<{ path: string; content: Buffer }[]> {
  const out: { path: string; content: Buffer }[] = [];
  let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.posix.join(prefix, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectFiles(full, rel)));
    } else if (ent.isFile()) {
      out.push({ path: rel, content: await fs.readFile(full) });
    }
  }
  return out;
}

export async function publishArchiveEntryToGitHub(slug: string): Promise<{
  commitSha: string;
  paths: string[];
}> {
  const { octokit, config } = requireArchiveOctokit();

  const contentDir = contentArchiveDir(slug);
  const publicDir = publicArchiveDir(slug);

  const files: { path: string; content: Buffer }[] = [
    ...(await collectFiles(contentDir, `content/archive/${slug}`)),
    ...(await collectFiles(publicDir, `public/archive/${slug}`)),
  ];

  if (files.length === 0) {
    throw new Error(`No archive files found for slug: ${slug}`);
  }

  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const commitSha = ref.data.object.sha;

  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: commitSha,
  });
  const baseTreeSha = commit.data.tree.sha;

  const blobs = await Promise.all(
    files.map(async (file) => {
      const isText =
        file.path.endsWith(".json") ||
        file.path.endsWith(".md") ||
        file.path.endsWith(".html");
      const { data } = await octokit.git.createBlob({
        owner: config.owner,
        repo: config.repo,
        content: isText
          ? file.content.toString("utf8")
          : file.content.toString("base64"),
        encoding: isText ? "utf-8" : "base64",
      });
      return { path: file.path, sha: data.sha };
    }),
  );

  const { data: tree } = await octokit.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: baseTreeSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: b.sha,
    })),
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: `archive: accession ${slug}`,
    tree: tree.sha,
    parents: [commitSha],
  });

  await octokit.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
    sha: newCommit.sha,
  });

  return {
    commitSha: newCommit.sha,
    paths: files.map((f) => f.path),
  };
}

export async function updateArchiveProvenanceOnGitHub(
  slug: string,
  metadataJson: string,
): Promise<{ commitSha: string }> {
  const { octokit, config } = requireArchiveOctokit();

  const filePath = `content/archive/${slug}/metadata.json`;

  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const commitSha = ref.data.object.sha;

  const { data: blob } = await octokit.git.createBlob({
    owner: config.owner,
    repo: config.repo,
    content: metadataJson,
    encoding: "utf-8",
  });

  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: commitSha,
  });

  const { data: tree } = await octokit.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: commit.data.tree.sha,
    tree: [
      {
        path: filePath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      },
    ],
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: `archive: provenance ${slug}`,
    tree: tree.sha,
    parents: [commitSha],
  });

  await octokit.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
    sha: newCommit.sha,
  });

  return { commitSha: newCommit.sha };
}

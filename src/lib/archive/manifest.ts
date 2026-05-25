import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  ARCHIVE_VERSION,
  AccessionManifestSchema,
  type AccessionManifest,
  type ArchiveEntry,
  type ArchiveHash,
  type ExportInventoryItem,
} from "./schema";
import {
  contentArchiveDir,
  contentArchivePreparedDir,
  contentArchiveSourceDir,
  publicArchiveDir,
} from "./paths";
import { buildAccessionRuntime } from "./runtime";

export function hashBuffer(buffer: Buffer): ArchiveHash {
  return {
    algorithm: "sha256",
    value: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function hashFile(filePath: string): Promise<ArchiveHash | undefined> {
  try {
    return hashBuffer(await fs.readFile(filePath));
  } catch {
    return undefined;
  }
}

async function derivativeHashes(entry: ArchiveEntry) {
  const hashes: Record<string, ArchiveHash> = {};
  for (const derivative of buildAccessionRuntime(entry).derivatives) {
    const checksum = await hashFile(
      path.join(publicArchiveDir(entry.slug), path.basename(derivative.path)),
    );
    if (checksum) hashes[derivative.path] = checksum;
  }
  return hashes;
}

export async function generateAccessionManifest(
  entry: ArchiveEntry,
  exports: ExportInventoryItem[] = entry.exports,
): Promise<AccessionManifest> {
  const runtime = buildAccessionRuntime(entry);
  const sourceHash = entry.source?.storedFilename
    ? await hashFile(path.join(contentArchiveSourceDir(entry.slug), entry.source.storedFilename))
    : undefined;
  const preparedHash = entry.processing?.preparedSource
    ? await hashFile(
        path.join(
          contentArchivePreparedDir(entry.slug),
          path.basename(entry.processing.preparedSource),
        ),
      )
    : undefined;
  const htmlHash = await hashFile(
    path.join(contentArchiveDir(entry.slug), entry.export.standaloneHtml),
  );

  return AccessionManifestSchema.parse({
    archiveVersion: ARCHIVE_VERSION,
    manifestVersion: "manifest-v1",
    accessionId: runtime.accessionId,
    slug: runtime.slug,
    generatedAt: new Date().toISOString(),
    updatedAt: entry.updatedAt,
    source: entry.source,
    prepared: entry.processing,
    derivatives: runtime.derivatives,
    exports,
    perceptualStateCount: runtime.perception.states.length,
    provenanceSummary: {
      mintLinks: runtime.provenance.mint.length,
      auctionLinks: runtime.provenance.auction.length,
      marketplaceLinks: runtime.provenance.marketplace.length,
    },
    exportPreset: runtime.exportSettings.preset,
    visibilityStatus: runtime.status,
    integrity: {
      source: sourceHash,
      prepared: preparedHash,
      derivatives: await derivativeHashes(entry),
      html: htmlHash,
    },
  });
}

export async function writeAccessionManifest(
  entry: ArchiveEntry,
  exports?: ExportInventoryItem[],
): Promise<AccessionManifest> {
  const manifest = await generateAccessionManifest(entry, exports);
  await fs.writeFile(
    path.join(contentArchiveDir(entry.slug), "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

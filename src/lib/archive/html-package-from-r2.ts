/**
 * Build a portable mint-package-v1 ZIP from a published D1/R2 revision.
 * Does not write to content/archive/ or public/archive/.
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { buildStandaloneHtmlFromBuffers } from "@/lib/archive/standalone-html";
import { ARCHIVE_IMAGE_OUTPUTS } from "@/lib/archive/image-specs";
import type { WorkerArtworkDetail } from "@/lib/archive/worker-client";
import { buildStoreZip, type ZipStoreEntry } from "@/lib/archive/zip-store";
import type { PerceptionArtwork } from "@/lib/perception/types";
import { createR2Client, getR2ClientOrNull } from "@/lib/r2/client";
import { getR2Config } from "@/lib/r2/config";
import type {
  StandaloneExportProfile,
  StandaloneSizeReport,
} from "@/lib/html-export/standalone-profile";
import { createHash } from "node:crypto";

export const HTML_PACKAGE_EXPORT_VERSION = "mint-package-v1";
export const ONCHAIN_HTML_PACKAGE_VERSION = "onchain-html-v1";

const DERIVATIVE_ROLES = [
  { role: "artwork", filename: ARCHIVE_IMAGE_OUTPUTS.artwork.filename },
  { role: "preview", filename: ARCHIVE_IMAGE_OUTPUTS.previewAvif.filename },
  { role: "preview_webp", filename: ARCHIVE_IMAGE_OUTPUTS.previewWebp.filename },
  { role: "previewWebp", filename: ARCHIVE_IMAGE_OUTPUTS.previewWebp.filename },
  { role: "social", filename: ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename },
  { role: "thumb", filename: ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename },
] as const;

export type HtmlPackageAssetRow = {
  role: string;
  object_key: string;
  mime_type: string;
  byte_size: number;
};

export function assertPublishedForHtmlPackage(detail: WorkerArtworkDetail): {
  revision: number;
  assets: HtmlPackageAssetRow[];
  metadata: Record<string, unknown>;
  perception: Record<string, unknown>;
  exportJson: Record<string, unknown>;
  provenance: Record<string, unknown>;
} {
  const artwork = detail.artwork;
  if (artwork.status !== "published" || artwork.publishedRevision == null) {
    throw Object.assign(
      new Error(
        "HTML package requires a published revision. Publish the artwork first.",
      ),
      { status: 409 },
    );
  }
  const published = detail.publishedRevision;
  if (!published) {
    throw Object.assign(new Error("Published revision record is missing"), {
      status: 404,
    });
  }
  const assets =
    detail.publishedAssets && detail.publishedAssets.length > 0
      ? detail.publishedAssets
      : detail.assets;
  if (!assets.some((a) => a.role === "artwork")) {
    throw Object.assign(
      new Error("Published revision is missing the artwork derivative"),
      { status: 409 },
    );
  }
  return {
    revision: artwork.publishedRevision,
    assets,
    metadata: (published.metadata ?? {}) as Record<string, unknown>,
    perception: (published.perception ?? {}) as Record<string, unknown>,
    exportJson: (published.export ?? {}) as Record<string, unknown>,
    provenance: (published.provenance ?? {}) as Record<string, unknown>,
  };
}

function findAsset(
  assets: HtmlPackageAssetRow[],
  role: string,
): HtmlPackageAssetRow | undefined {
  return assets.find((a) => a.role === role);
}

function perceptionArtworkFromPublished(input: {
  title: string;
  accessionId: string;
  metadata: Record<string, unknown>;
  perception: Record<string, unknown>;
}): PerceptionArtwork {
  const meta = input.metadata;
  const perception = input.perception;
  const states = Array.isArray(perception.states) ? perception.states : [];
  return {
    id: input.accessionId,
    metadata: {
      title: String(meta.title ?? input.title ?? "untitled"),
      year: meta.year != null ? Number(meta.year) : undefined,
      process: meta.process != null ? String(meta.process) : undefined,
      date: meta.date != null ? String(meta.date) : undefined,
      accessionId: input.accessionId,
      perceptualNotes:
        meta.perceptualNotes != null ? String(meta.perceptualNotes) : undefined,
      rotationalObservations:
        meta.rotationalObservations != null
          ? String(meta.rotationalObservations)
          : undefined,
      ...meta,
    } as PerceptionArtwork["metadata"],
    imageSrc: "",
    states: states as PerceptionArtwork["states"],
    background: (perception.background as string) || "paper",
    initialAngle: Number(perception.initialAngle ?? 0),
    snapToState: perception.snapToState !== false,
    showMetadataOverlay: perception.showMetadataOverlay !== false,
    overlayFields: perception.overlayFields as PerceptionArtwork["overlayFields"],
  };
}

async function getObjectBytes(objectKey: string): Promise<Buffer> {
  const config = getR2Config();
  const client = getR2ClientOrNull();
  if (!config || !client) {
    throw Object.assign(new Error("R2 is not configured"), { status: 503 });
  }
  const result = await createR2Client(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );
  if (!result.Body) {
    throw Object.assign(new Error(`R2 object empty: ${objectKey}`), {
      status: 502,
    });
  }
  return Buffer.from(await result.Body.transformToByteArray());
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type BuiltHtmlPackage = {
  zip: Buffer;
  filename: string;
  files: { path: string; bytes: number; role: string }[];
  accessionId: string;
  slug: string;
  revision: number;
  profile: StandaloneExportProfile;
  sizeReport: StandaloneSizeReport;
};

/** On-chain package: perception.html + size report only (no derivative duplicates). */
export function assembleOnchainHtmlPackageZip(input: {
  perceptionHtml: string;
  sizeReport: StandaloneSizeReport;
}): { zip: Buffer; files: { path: string; bytes: number; role: string }[] } {
  const reportJson = `${JSON.stringify(input.sizeReport, null, 2)}\n`;
  const entries: ZipStoreEntry[] = [
    {
      path: "perception.html",
      data: Buffer.from(input.perceptionHtml, "utf8"),
    },
    { path: "size-report.json", data: Buffer.from(reportJson, "utf8") },
  ];
  return {
    zip: buildStoreZip(entries),
    files: [
      {
        path: "perception.html",
        bytes: Buffer.byteLength(input.perceptionHtml, "utf8"),
        role: "standalone-html",
      },
      {
        path: "size-report.json",
        bytes: Buffer.byteLength(reportJson, "utf8"),
        role: "size-report",
      },
    ],
  };
}

/** Pure assembly helper for tests — no R2 I/O. */
export function assembleHtmlPackageZip(input: {
  perceptionHtml: string;
  metadataJson: string;
  statesJson: string;
  manifestJson: string;
  provenanceTemplate: string;
  collectorNotes: string;
  derivatives: { filename: string; data: Buffer; role: string }[];
}): { zip: Buffer; files: { path: string; bytes: number; role: string }[] } {
  const entries: ZipStoreEntry[] = [
    {
      path: "perception.html",
      data: Buffer.from(input.perceptionHtml, "utf8"),
    },
    { path: "metadata.json", data: Buffer.from(input.metadataJson, "utf8") },
    { path: "states.json", data: Buffer.from(input.statesJson, "utf8") },
    { path: "manifest.json", data: Buffer.from(input.manifestJson, "utf8") },
    {
      path: "provenance-template.json",
      data: Buffer.from(input.provenanceTemplate, "utf8"),
    },
    {
      path: "collector-notes.txt",
      data: Buffer.from(input.collectorNotes, "utf8"),
    },
    ...input.derivatives.map((d) => ({
      path: d.filename,
      data: d.data,
    })),
  ];
  const files = [
    {
      path: "perception.html",
      bytes: Buffer.byteLength(input.perceptionHtml, "utf8"),
      role: "standalone-html",
    },
    {
      path: "metadata.json",
      bytes: Buffer.byteLength(input.metadataJson, "utf8"),
      role: "metadata",
    },
    {
      path: "states.json",
      bytes: Buffer.byteLength(input.statesJson, "utf8"),
      role: "states",
    },
    {
      path: "manifest.json",
      bytes: Buffer.byteLength(input.manifestJson, "utf8"),
      role: "manifest",
    },
    {
      path: "provenance-template.json",
      bytes: Buffer.byteLength(input.provenanceTemplate, "utf8"),
      role: "provenance-template",
    },
    {
      path: "collector-notes.txt",
      bytes: Buffer.byteLength(input.collectorNotes, "utf8"),
      role: "collector-notes",
    },
    ...input.derivatives.map((d) => ({
      path: d.filename,
      bytes: d.data.length,
      role: d.role,
    })),
  ];
  return { zip: buildStoreZip(entries), files };
}

export async function buildHtmlPackageFromPublishedDetail(
  detail: WorkerArtworkDetail,
  options: {
    profile?: StandaloneExportProfile;
    includeWebpFallback?: boolean;
  } = {},
): Promise<BuiltHtmlPackage> {
  const profile = options.profile ?? "compatible";
  const published = assertPublishedForHtmlPackage(detail);
  const artworkBuf = await getObjectBytes(
    findAsset(published.assets, "artwork")!.object_key,
  );

  let webpBuf: Buffer | undefined;
  if (profile === "compatible" && options.includeWebpFallback !== false) {
    const webpAsset =
      findAsset(published.assets, "preview_webp") ||
      findAsset(published.assets, "previewWebp");
    webpBuf = webpAsset
      ? await getObjectBytes(webpAsset.object_key)
      : undefined;
  }

  const perceptionArtwork = perceptionArtworkFromPublished({
    title: detail.artwork.title,
    accessionId: detail.artwork.accessionId,
    metadata: published.metadata,
    perception: published.perception,
  });

  const standalone = await buildStandaloneHtmlFromBuffers(
    {
      version: 1,
      artwork: perceptionArtwork,
      exportedAt: new Date().toISOString(),
    },
    artworkBuf,
    webpBuf,
    {
      profile,
      includeWebpFallback: profile === "compatible",
    },
  );

  if (profile === "onchain") {
    const assembled = assembleOnchainHtmlPackageZip({
      perceptionHtml: standalone.html,
      sizeReport: {
        profile: standalone.profile,
        htmlByteSize: standalone.htmlByteSize,
        embeddedAvifByteSize: standalone.embeddedAvifByteSize,
        embeddedWebpByteSize: standalone.embeddedWebpByteSize,
      },
    });
    return {
      zip: assembled.zip,
      filename: `${detail.artwork.slug}-onchain-html.zip`,
      files: assembled.files,
      accessionId: detail.artwork.accessionId,
      slug: detail.artwork.slug,
      revision: published.revision,
      profile,
      sizeReport: {
        profile: standalone.profile,
        htmlByteSize: standalone.htmlByteSize,
        embeddedAvifByteSize: standalone.embeddedAvifByteSize,
        embeddedWebpByteSize: standalone.embeddedWebpByteSize,
      },
    };
  }

  const metadataJson = JSON.stringify(
    {
      ...published.metadata,
      accessionId: detail.artwork.accessionId,
      slug: detail.artwork.slug,
      title: detail.artwork.title,
      publishedRevision: published.revision,
      exportVersion: HTML_PACKAGE_EXPORT_VERSION,
      standaloneProfile: profile,
    },
    null,
    2,
  );
  const statesJson = JSON.stringify(
    { states: perceptionArtwork.states },
    null,
    2,
  );

  const derivatives: { filename: string; data: Buffer; role: string }[] = [];
  const seen = new Set<string>();
  for (const spec of DERIVATIVE_ROLES) {
    const asset = findAsset(published.assets, spec.role);
    if (!asset || seen.has(spec.filename)) continue;
    seen.add(spec.filename);
    derivatives.push({
      filename: spec.filename,
      data: await getObjectBytes(asset.object_key),
      role: spec.role === "previewWebp" ? "preview_webp" : spec.role,
    });
  }

  const manifestEntries = [
    {
      path: "perception.html",
      sha256: sha256Hex(Buffer.from(standalone.html, "utf8")),
    },
    ...derivatives.map((d) => ({
      path: d.filename,
      sha256: sha256Hex(d.data),
    })),
  ];
  const manifestJson = JSON.stringify(
    {
      version: HTML_PACKAGE_EXPORT_VERSION,
      accessionId: detail.artwork.accessionId,
      slug: detail.artwork.slug,
      publishedRevision: published.revision,
      standaloneProfile: profile,
      sizeReport: {
        htmlByteSize: standalone.htmlByteSize,
        embeddedAvifByteSize: standalone.embeddedAvifByteSize,
        embeddedWebpByteSize: standalone.embeddedWebpByteSize,
      },
      generatedAt: new Date().toISOString(),
      files: manifestEntries,
    },
    null,
    2,
  );

  const provenanceTemplate = JSON.stringify(
    {
      accessionId: detail.artwork.accessionId,
      slug: detail.artwork.slug,
      provenance: published.provenance,
      notes: "Record mint, auction, and marketplace links after publication.",
    },
    null,
    2,
  );

  const provenance = published.provenance as {
    mint?: unknown[];
  };
  const mintCount = Array.isArray(provenance.mint) ? provenance.mint.length : 0;
  const collectorNotes = [
    perceptionArtwork.metadata.title,
    "",
    `Accession: ${detail.artwork.accessionId}`,
    perceptionArtwork.metadata.date
      ? `Date: ${perceptionArtwork.metadata.date}`
      : undefined,
    perceptionArtwork.metadata.year
      ? `Year: ${perceptionArtwork.metadata.year}`
      : undefined,
    perceptionArtwork.metadata.process
      ? `Process: ${perceptionArtwork.metadata.process}`
      : undefined,
    "",
    "Perceptual notes",
    perceptionArtwork.metadata.perceptualNotes ||
      "No perceptual notes recorded.",
    "",
    "Rotational observations",
    perceptionArtwork.metadata.rotationalObservations ||
      "No rotational observations recorded.",
    "",
    `Provenance status: ${
      mintCount > 0
        ? "Mint provenance recorded"
        : "Mint provenance not yet recorded"
    }`,
    `Generated: ${new Date().toISOString()}`,
    `Published revision: ${published.revision}`,
    "",
    "This package is a portable archival derivative of the published D1/R2 revision.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  const assembled = assembleHtmlPackageZip({
    perceptionHtml: standalone.html,
    metadataJson,
    statesJson,
    manifestJson,
    provenanceTemplate,
    collectorNotes,
    derivatives,
  });

  return {
    zip: assembled.zip,
    filename: `${detail.artwork.slug}-mint-package.zip`,
    files: assembled.files,
    accessionId: detail.artwork.accessionId,
    slug: detail.artwork.slug,
    revision: published.revision,
    profile,
    sizeReport: {
      profile: standalone.profile,
      htmlByteSize: standalone.htmlByteSize,
      embeddedAvifByteSize: standalone.embeddedAvifByteSize,
      embeddedWebpByteSize: standalone.embeddedWebpByteSize,
    },
  };
}

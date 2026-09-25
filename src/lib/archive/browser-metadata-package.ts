/**
 * Client/server-safe metadata package for browser-first commit-bundle.
 * Builds JSON/markdown text files the commit path needs — does not run Sharp
 * or rewrite the full export orchestrator.
 */

import {
  accessionDraftToArchiveDraft,
  draftToArchiveEntry,
} from "./adapters";
import { buildArchiveBundleFiles } from "./generate-entry";
import {
  ARCHIVE_IMAGE_OUTPUTS,
  archiveImageOutputFilenames,
} from "./image-specs";
import {
  AccessionDraftSchema,
  ArchiveEntrySchema,
  defaultArchiveAssets,
  type AccessionDraft,
  type ArchiveEntry,
  type ArchiveMedia,
  type ArchiveAssets,
  type DerivativeAsset,
  type DraftStatus,
} from "./schema";

export interface BrowserDerivativeMeta {
  filename: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType?: string;
}

export interface MetadataPackageFile {
  path: string;
  content: string;
}

export interface BrowserMetadataPackage {
  slug: string;
  draftId: string;
  entry: ArchiveEntry;
  draft: AccessionDraft;
  files: MetadataPackageFile[];
  warnings: string[];
}

function roleForFilename(filename: string): DerivativeAsset["role"] {
  if (filename === ARCHIVE_IMAGE_OUTPUTS.thumbJpg.filename) return "thumb";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.socialJpg.filename) return "social";
  if (filename === ARCHIVE_IMAGE_OUTPUTS.artwork.filename) return "artwork";
  return "preview";
}

function formatForFilename(filename: string): string {
  if (filename.endsWith(".avif")) return "avif";
  if (filename.endsWith(".webp")) return "webp";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "jpeg";
  if (filename.endsWith(".png")) return "png";
  return "bin";
}

export function buildDerivativeAssetsFromBrowserMeta(
  slug: string,
  metas: BrowserDerivativeMeta[],
  generatedAt = new Date().toISOString(),
): DerivativeAsset[] {
  const byName = new Map(metas.map((m) => [m.filename, m]));
  return archiveImageOutputFilenames().map((filename) => {
    const meta = byName.get(filename);
    return {
      role: roleForFilename(filename),
      path: `/archive/${slug}/${filename}`,
      format: formatForFilename(filename),
      width: meta?.width ?? 1,
      height: meta?.height ?? 1,
      byteSize: meta?.byteSize ?? 0,
      generatedAt,
    };
  });
}

/**
 * Build metadata.json / states.json / notes.md / draft sidecars for commit-bundle.
 * When `r2Media` is provided, assets/derivatives use absolute CDN URLs and no
 * binary paths are implied for GitHub.
 */
export function buildBrowserMetadataPackage(input: {
  draft: AccessionDraft;
  derivativeMetas: BrowserDerivativeMeta[];
  existingEntry?: ArchiveEntry | null;
  status?: DraftStatus;
  r2Media?: ArchiveMedia;
  r2Assets?: ArchiveAssets;
  r2Derivatives?: DerivativeAsset[];
  /** When true, omit draft sidecar files from the GitHub text package. */
  omitDraftSidecars?: boolean;
  /** When true, include a lightweight manifest.json with R2 keys. */
  includeManifest?: boolean;
}): BrowserMetadataPackage {
  const parsedDraft = AccessionDraftSchema.parse(input.draft);
  const generatedAt = new Date().toISOString();
  const nextStatus: DraftStatus = input.status ?? "generated";

  const archiveDraft = accessionDraftToArchiveDraft(parsedDraft);
  archiveDraft.status = nextStatus === "prepared" ? "draft" : nextStatus;

  const generatedEntry = draftToArchiveEntry(archiveDraft);
  const existing = input.existingEntry ?? undefined;
  const derivatives =
    input.r2Derivatives ??
    buildDerivativeAssetsFromBrowserMeta(
      parsedDraft.slug,
      input.derivativeMetas,
      generatedAt,
    );

  const resolvedStatus: DraftStatus =
    nextStatus === "draft" || nextStatus === "prepared"
      ? "generated"
      : nextStatus;

  const entry: ArchiveEntry = ArchiveEntrySchema.parse({
    ...generatedEntry,
    createdAt: existing?.createdAt ?? generatedEntry.createdAt,
    status: resolvedStatus,
    publishedAt:
      resolvedStatus === "published"
        ? existing?.publishedAt ?? generatedAt
        : existing?.publishedAt,
    mintedAt: existing?.mintedAt ?? generatedEntry.mintedAt,
    hiddenAt:
      resolvedStatus === "hidden"
        ? existing?.hiddenAt ?? generatedAt
        : existing?.hiddenAt,
    withdrawnAt: existing?.withdrawnAt ?? generatedEntry.withdrawnAt,
    provenance:
      parsedDraft.provenance ?? existing?.provenance ?? generatedEntry.provenance,
    exports: existing?.exports ?? generatedEntry.exports,
    accessionId: existing?.accessionId ?? generatedEntry.accessionId,
    source: parsedDraft.source ?? existing?.source ?? generatedEntry.source,
    processing: parsedDraft.processing?.preparedSource
      ? {
          ...parsedDraft.processing,
          preparedSource: input.r2Media?.prepared?.key
            ? input.r2Media.prepared.key
            : "prepared/master-prepared.avif",
        }
      : existing?.processing ?? parsedDraft.processing,
    assets: input.r2Assets ?? defaultArchiveAssets(parsedDraft.slug),
    media: input.r2Media,
    derivatives,
    metadata: {
      ...generatedEntry.metadata,
      accessionId:
        existing?.metadata.accessionId ??
        existing?.accessionId ??
        generatedEntry.metadata.accessionId,
    },
    updatedAt: generatedAt,
  });

  if (resolvedStatus !== "published") {
    delete entry.publishedAt;
  }
  if (resolvedStatus !== "hidden") {
    delete entry.hiddenAt;
  }

  const isR2 = Boolean(input.r2Media);
  const incompleteNote = isR2
    ? [
        "R2_BROWSER_ACCESSION",
        "Binaries live in Cloudflare R2; revision metadata is stored with the archive record.",
        "Included: metadata.json, states.json, notes.md" +
          (input.includeManifest ? ", manifest.json" : "") +
          ".",
        "Excluded from this package: perception.html and mint-package export.",
        "Public pages update when the published revision metadata is available.",
      ].join(" ")
    : [
        "BROWSER_MVP_INCOMPLETE",
        "This accession was generated by the browser-first commit path.",
        "Included: metadata.json, states.json, notes.md, and the five public derivatives.",
        "Excluded from this MVP package: perception.html (standalone HTML) and manifest.json.",
        "Excluded workflows until a full regenerate: mint-package export and offline HTML distribution.",
        "Sync/publish validation only requires metadata.json + public derivatives.",
        "Public Next.js archive pages need a redeploy to pick up GitHub tip content.",
      ].join(" ");

  const warnings: string[] = [];
  if (!entry.metadata.title.trim()) {
    warnings.push("Title is empty; slug may be the only public label.");
  }
  if (entry.perception.states.length === 0) {
    warnings.push("No perceptual states defined.");
  }
  if (isR2) {
    warnings.push(
      "R2 media package: binaries stay in Cloudflare R2; metadata is written with the revision. Public pages follow published revision data.",
    );
  } else {
    warnings.push(
      "Incomplete browser MVP package: perception.html and manifest.json were not written. Mint-package export is unavailable until a full local regenerate. Public View remains redeploy-bound.",
    );
  }

  entry.processing = {
    ...entry.processing,
    prepareVersion:
      entry.processing?.prepareVersion ??
      (isR2 ? "browser-r2-v1" : "browser-mvp-v1-no-html-manifest"),
  };
  entry.metadata = {
    ...entry.metadata,
    perceptualNotes: entry.metadata.perceptualNotes
      ? `${entry.metadata.perceptualNotes}\n\n${incompleteNote}`
      : incompleteNote,
  };

  const bundle = buildArchiveBundleFiles(entry);
  const notesBanner = isR2
    ? [
        "> R2 MEDIA PACKAGE",
        ">",
        "> Written with revision: metadata.json, states.json, notes.md" +
          (input.includeManifest ? ", manifest.json" : "") +
          ".",
        "> Binaries stored in Cloudflare R2 (see entry.media).",
        "> Not written: perception.html. Mint-package excluded until full regenerate.",
        "",
      ]
    : [
        "> BROWSER MVP INCOMPLETE PACKAGE",
        ">",
        "> Written: metadata.json, states.json, notes.md, five public derivatives.",
        "> Not written: perception.html, manifest.json.",
        "> Mint-package and offline HTML export are excluded until full regenerate.",
        "",
      ];
  const notesWithBanner = [
    ...notesBanner,
    bundle.notesMd.endsWith("\n") ? bundle.notesMd.slice(0, -1) : bundle.notesMd,
    "",
  ].join("\n");

  const updatedDraft = AccessionDraftSchema.parse({
    ...parsedDraft,
    status: resolvedStatus,
    generatedAt: generatedAt,
    preparedAt: parsedDraft.preparedAt ?? generatedAt,
    publishedAt:
      resolvedStatus === "published"
        ? parsedDraft.publishedAt ?? generatedAt
        : undefined,
    hiddenAt:
      resolvedStatus === "hidden"
        ? parsedDraft.hiddenAt ?? generatedAt
        : undefined,
    updatedAt: generatedAt,
    processing: {
      ...parsedDraft.processing,
      prepareVersion:
        parsedDraft.processing.prepareVersion ??
        (isR2 ? "browser-r2-v1" : "browser-mvp-v1-no-html-manifest"),
    },
  });

  const statesSidecar = {
    version: updatedDraft.version,
    draftId: updatedDraft.draftId,
    slug: updatedDraft.slug,
    perception: {
      states: updatedDraft.artwork.states,
      background: updatedDraft.artwork.background,
      initialAngle: updatedDraft.artwork.initialAngle,
      snapToState: updatedDraft.artwork.snapToState,
      showMetadataOverlay: updatedDraft.artwork.showMetadataOverlay,
      overlayFields: updatedDraft.artwork.overlayFields,
    },
    updatedAt: updatedDraft.updatedAt,
    browserMvpIncomplete: isR2
      ? {
          storage: "r2",
          missing: ["perception.html"],
          excluded: ["mint-package", "offline-html-distribution"],
        }
      : {
          missing: ["perception.html", "manifest.json"],
          excluded: ["mint-package", "offline-html-distribution"],
        },
  };

  const files: MetadataPackageFile[] = [
    {
      path: `content/archive/${entry.slug}/metadata.json`,
      content: `${JSON.stringify(entry, null, 2)}\n`,
    },
    {
      path: `content/archive/${entry.slug}/states.json`,
      content: `${bundle.statesJson}\n`,
    },
    {
      path: `content/archive/${entry.slug}/notes.md`,
      content: notesWithBanner.endsWith("\n")
        ? notesWithBanner
        : `${notesWithBanner}\n`,
    },
  ];

  if (input.includeManifest && input.r2Media) {
    const manifest = {
      archiveVersion: entry.version,
      manifestVersion: "manifest-v1" as const,
      accessionId: entry.accessionId,
      slug: entry.slug,
      generatedAt,
      updatedAt: generatedAt,
      storage: "r2" as const,
      revision: input.r2Media.revision,
      media: input.r2Media,
      source: entry.source,
      prepared: entry.processing,
      derivatives: entry.derivatives,
      perceptualStateCount: entry.perception.states.length,
      provenanceSummary: {
        mintLinks: entry.provenance.mint.length,
        auctionLinks: entry.provenance.auction.length,
        marketplaceLinks: entry.provenance.marketplace.length,
      },
      exportPreset: entry.export.preset,
      visibilityStatus: entry.status,
    };
    files.push({
      path: `content/archive/${entry.slug}/manifest.json`,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });
  }

  if (!input.omitDraftSidecars) {
    files.push(
      {
        path: `content/drafts/${updatedDraft.draftId}/draft.json`,
        content: `${JSON.stringify(updatedDraft, null, 2)}\n`,
      },
      {
        path: `content/drafts/${updatedDraft.draftId}/states.json`,
        content: `${JSON.stringify(statesSidecar, null, 2)}\n`,
      },
    );
  }

  return {
    slug: entry.slug,
    draftId: updatedDraft.draftId,
    entry,
    draft: updatedDraft,
    files,
    warnings,
  };
}

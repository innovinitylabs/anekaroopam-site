import fs from "fs/promises";
import path from "path";
import { loadArchiveEntry } from "./load-entry";
import { hashFile, writeAccessionManifest } from "./manifest";
import {
  contentArchiveDir,
  contentArchiveMintPackageDir,
  publicArchiveDir,
} from "./paths";
import {
  ArchiveEntrySchema,
  type ArchiveEntry,
  type ExportInventoryItem,
} from "./schema";
import { buildAccessionRuntime, type AccessionRuntime } from "./runtime";

const EXPORT_VERSION = "mint-package-v1";

export interface MintPackageFile {
  role: string;
  sourcePath: string;
  packagePath: string;
}

export interface MintPackagePlan {
  runtime: AccessionRuntime;
  files: MintPackageFile[];
  packageDir: string;
  collectorNotes: string;
  provenanceTemplate: string;
}

function archiveFile(slug: string, filename: string): string {
  return path.join(contentArchiveDir(slug), filename);
}

function publicFile(slug: string, filename: string): string {
  return path.join(publicArchiveDir(slug), filename);
}

export function buildCollectorNotes(runtime: AccessionRuntime): string {
  const metadata = runtime.metadata;
  const provenanceStatus = runtime.provenance.mint.length
    ? "Mint provenance recorded"
    : "Mint provenance not yet recorded";
  return [
    metadata.title,
    "",
    `Accession: ${runtime.accessionId ?? runtime.slug}`,
    metadata.date ? `Date: ${metadata.date}` : undefined,
    metadata.year ? `Year: ${metadata.year}` : undefined,
    metadata.process ? `Process: ${metadata.process}` : undefined,
    "",
    "Perceptual notes",
    metadata.perceptualNotes || "No perceptual notes recorded.",
    "",
    "Rotational observations",
    metadata.rotationalObservations || "No rotational observations recorded.",
    "",
    `Provenance status: ${provenanceStatus}`,
    `Generated: ${runtime.updatedAt}`,
    "",
    "This package is a portable archival derivative of the canonical filesystem record.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function buildMintPackage(entry: ArchiveEntry): Promise<MintPackagePlan> {
  const runtime = buildAccessionRuntime(entry);
  const packageDir = contentArchiveMintPackageDir(entry.slug);
  const provenanceTemplate = JSON.stringify(
    {
      accessionId: runtime.accessionId,
      slug: runtime.slug,
      provenance: runtime.provenance,
      notes: "Record mint, auction, and marketplace links after publication.",
    },
    null,
    2,
  );

  return {
    runtime,
    packageDir,
    collectorNotes: buildCollectorNotes(runtime),
    provenanceTemplate,
    files: [
      {
        role: "standalone-html",
        sourcePath: archiveFile(entry.slug, entry.export.standaloneHtml),
        packagePath: path.join(packageDir, "perception.html"),
      },
      {
        role: "metadata",
        sourcePath: archiveFile(entry.slug, "metadata.json"),
        packagePath: path.join(packageDir, "metadata.json"),
      },
      {
        role: "manifest",
        sourcePath: archiveFile(entry.slug, "manifest.json"),
        packagePath: path.join(packageDir, "manifest.json"),
      },
      ...runtime.derivatives.map((derivative) => ({
        role: derivative.role,
        sourcePath: publicFile(entry.slug, path.basename(derivative.path)),
        packagePath: path.join(packageDir, path.basename(derivative.path)),
      })),
      {
        role: "provenance-template",
        sourcePath: "",
        packagePath: path.join(packageDir, "provenance-template.json"),
      },
      {
        role: "collector-notes",
        sourcePath: "",
        packagePath: path.join(packageDir, "collector-notes.txt"),
      },
    ],
  };
}

async function exportInventoryItem(
  role: string,
  filePath: string,
  generatedAt: string,
): Promise<ExportInventoryItem> {
  const stat = await fs.stat(filePath);
  const checksum = await hashFile(filePath);
  if (!checksum) throw new Error(`Checksum failed for export: ${filePath}`);
  return {
    role,
    path: filePath,
    generatedAt,
    byteSize: stat.size,
    checksum,
    exportVersion: EXPORT_VERSION,
  };
}

export async function exportMintPackage(slug: string): Promise<{
  entry: ArchiveEntry;
  exports: ExportInventoryItem[];
  packageDir: string;
}> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  await writeAccessionManifest(entry);
  const plan = await buildMintPackage(entry);
  await fs.mkdir(plan.packageDir, { recursive: true });

  const generatedAt = entry.updatedAt;
  const inventory: ExportInventoryItem[] = [];
  for (const file of plan.files) {
    await fs.mkdir(path.dirname(file.packagePath), { recursive: true });
    if (file.role === "provenance-template") {
      await fs.writeFile(file.packagePath, `${plan.provenanceTemplate}\n`);
    } else if (file.role === "collector-notes") {
      await fs.writeFile(file.packagePath, `${plan.collectorNotes}\n`);
    } else {
      await fs.copyFile(file.sourcePath, file.packagePath);
    }
    inventory.push(await exportInventoryItem(file.role, file.packagePath, generatedAt));
  }

  const updated = ArchiveEntrySchema.parse({
    ...entry,
    exports: inventory,
    updatedAt: entry.updatedAt,
  });
  await fs.writeFile(
    path.join(contentArchiveDir(slug), "metadata.json"),
    `${JSON.stringify(updated, null, 2)}\n`,
  );
  await writeAccessionManifest(updated, inventory);

  return { entry: updated, exports: inventory, packageDir: plan.packageDir };
}

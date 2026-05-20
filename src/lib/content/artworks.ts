import type { PerceptionArtwork } from "@/lib/perception/types";

export type ArchiveFilter = {
  year?: number;
  process?: string;
  state?: string;
};

function artworkSrc(filename: string): string {
  return `/artworks/${encodeURIComponent(filename)}`;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

const ARCHIVE_FILES = [
  {
    id: "the-one-who-is-crown-among-the-kings",
    file: "The One Who Is Crown Among The Kings.png",
  },
  {
    id: "valiroopam",
    file: "Valiroopam.png",
  },
  {
    id: "aazhmaarrattam",
    file: "ஆழ்மாற்றம்.png",
  },
] as const;

function defaultStates(): PerceptionArtwork["states"] {
  return [
    { id: "s1", name: "", angle: 0, caption: "" },
    { id: "s2", name: "", angle: 120, caption: "" },
    { id: "s3", name: "", angle: 240, caption: "" },
  ];
}

export const archiveArtworks: PerceptionArtwork[] = ARCHIVE_FILES.map(
  ({ id, file }) => ({
    id,
    metadata: {
      title: titleFromFilename(file),
      process: "Valiroopam",
    },
    imageSrc: artworkSrc(file),
    states: defaultStates(),
    background: "paper",
    initialAngle: 0,
    snapToState: false,
    showMetadataOverlay: true,
  }),
);

export function getArtworkById(id: string): PerceptionArtwork | undefined {
  return archiveArtworks.find((a) => a.id === id);
}

export function filterArtworks(filters: ArchiveFilter): PerceptionArtwork[] {
  return archiveArtworks.filter((artwork) => {
    if (filters.year && artwork.metadata.year !== filters.year) return false;
    if (filters.process && artwork.metadata.process !== filters.process)
      return false;
    if (
      filters.state &&
      !artwork.states.some((s) =>
        s.name.toLowerCase().includes(filters.state!.toLowerCase()),
      )
    ) {
      return false;
    }
    return true;
  });
}

export function getArchiveYears(): number[] {
  return [
    ...new Set(
      archiveArtworks
        .map((a) => a.metadata.year)
        .filter((y): y is number => y !== undefined),
    ),
  ].sort((a, b) => b - a);
}

export function getArchiveProcesses(): string[] {
  return [
    ...new Set(
      archiveArtworks
        .map((a) => a.metadata.process)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
}

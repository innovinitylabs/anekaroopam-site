import type { PerceptionArtwork } from "@/lib/perception/types";

export type ArchiveFilter = {
  year?: number;
  process?: string;
  state?: string;
};

export const archiveArtworks: PerceptionArtwork[] = [
  {
    id: "witness-field",
    metadata: {
      title: "Witness Field",
      year: 2024,
      process: "Valiroopam",
      description:
        "A field of lines that resolves into witness-forms at oblique orientations.",
      tags: ["emergence", "figuration"],
    },
    imageSrc: "/artworks/witness-field.svg",
    states: [
      {
        id: "s1",
        name: "Witness",
        angle: 90,
        caption: "A witness that sees without eyes.",
      },
      {
        id: "s2",
        name: "Animal",
        angle: 217,
        caption: "The form destabilizes into instinct.",
      },
      {
        id: "s3",
        name: "Threshold",
        angle: 0,
        caption: "Neither figure nor ground claims precedence.",
      },
    ],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  },
  {
    id: "line-emergence",
    metadata: {
      title: "Line Emergence Study",
      year: 2023,
      process: "Valiroopam",
      description: "Spontaneous line clusters awaiting rotational discovery.",
    },
    imageSrc: "/artworks/line-emergence.svg",
    states: [
      {
        id: "s1",
        name: "Drift",
        angle: 45,
        caption: "Lines hesitate between becoming and undoing.",
      },
      {
        id: "s2",
        name: "Coherence",
        angle: 135,
        caption: "A face assembles from refusal.",
      },
    ],
    background: "archival",
    initialAngle: 45,
    snapToState: true,
    showMetadataOverlay: true,
  },
  {
    id: "rotational-void",
    metadata: {
      title: "Rotational Void",
      year: 2025,
      process: "Valiroopam",
      description: "Negative space rotates into presence.",
      tags: ["void", "rotation"],
    },
    imageSrc: "/artworks/rotational-void.svg",
    states: [
      {
        id: "s1",
        name: "Absence",
        angle: 0,
        caption: "The void holds the figure at bay.",
      },
      {
        id: "s2",
        name: "Emergence",
        angle: 180,
        caption: "Presence arrives sideways.",
      },
    ],
    background: "black",
    initialAngle: 0,
    snapToState: false,
    showMetadataOverlay: true,
  },
];

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

export interface WritingEntry {
  id: string;
  title: string;
  date: string;
  type: "essay" | "note" | "fragment" | "research";
  excerpt: string;
  body: string;
}

export const writings: WritingEntry[] = [
  {
    id: "unstable-figure",
    title: "On the Unstable Figure",
    date: "2024-03-12",
    type: "essay",
    excerpt:
      "Figuration is not a property of the image but a contract between orientation and attention.",
    body: `Figuration is not a property of the image but a contract between orientation and attention. When a line cluster refuses to settle, the viewer becomes a participant in its emergence.

Anekaroopam treats this refusal as method. The artwork does not present a subject; it presents a field of possible subjects, each latent until rotation makes it legible.

To archive such work is to preserve instability—not as defect, but as the work's native state.`,
  },
  {
    id: "rotation-note",
    title: "Rotation as Reading",
    date: "2024-07-02",
    type: "note",
    excerpt: "Turning the plane is turning the mind.",
    body: `Turning the plane is turning the mind. Each degree is a slight renegotiation of what counts as figure and what counts as ground.

I do not ask which orientation is correct. I ask which orientation is presently inhabited.`,
  },
  {
    id: "subconscious-fragment",
    title: "Subconscious Detection",
    date: "2025-01-18",
    type: "fragment",
    excerpt: "Forms arrive before naming.",
    body: `Forms arrive before naming. The hand moves; the eye recognizes later. Valiroopam is the discipline of not correcting too soon.`,
  },
  {
    id: "future-research",
    title: "Toward Dynamic Perceptual States",
    date: "2025-04-01",
    type: "research",
    excerpt:
      "Future work may bind states to time, generative process, or collective annotation.",
    body: `Future work may bind perceptual states to time, generative process, or collective annotation. The archive must remain open to configurations not yet imagined.

This platform is built as orientation infrastructure: extensible, quiet, and resistant to premature closure.`,
  },
];

export function getWritingById(id: string): WritingEntry | undefined {
  return writings.find((w) => w.id === id);
}

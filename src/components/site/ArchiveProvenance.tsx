import type { ProvenanceRecord } from "@/lib/archive/schema";

export function ArchiveProvenance({
  provenance,
}: {
  provenance: ProvenanceRecord;
}) {
  const links = [
    ...provenance.mint.map((link) => ({ ...link, kind: "Mint" })),
    ...provenance.auction.map((link) => ({ ...link, kind: "Auction" })),
    ...provenance.marketplace.map((link) => ({ ...link, kind: "Marketplace" })),
  ].filter((link) => link.url?.trim());

  if (links.length === 0) return null;

  return (
    <section className="pointer-events-auto fixed bottom-6 right-6 z-[55] max-w-xs border border-[var(--border)] bg-[var(--paper)]/90 px-4 py-3 backdrop-blur-sm">
      <h2 className="text-[0.58rem] tracking-[0.2em] uppercase text-[var(--muted)]">
        Provenance
      </h2>
      <div className="mt-2 space-y-2">
        {links.map((link, index) => (
          <div key={`${link.kind}-${link.url}-${index}`}>
            <p className="text-[0.72rem] text-[var(--muted)]">
              {link.platform || link.kind}
              {link.chain ? ` · ${link.chain}` : ""}
            </p>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[0.72rem] tracking-wide underline underline-offset-2"
            >
              {link.label || `${link.kind} record`}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

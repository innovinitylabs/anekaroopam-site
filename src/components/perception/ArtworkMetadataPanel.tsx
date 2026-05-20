"use client";

import { useState } from "react";
import type { ArtworkMetadata } from "@/lib/perception/types";

interface ArtworkMetadataPanelProps {
  metadata: ArtworkMetadata;
  onChange: (metadata: ArtworkMetadata) => void;
}

const labelClass =
  "text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]";
const inputClass =
  "mt-1 w-full border-b border-[var(--border)] bg-transparent py-1 outline-none";
const textareaClass =
  "mt-1 w-full resize-y border border-[var(--border)] bg-transparent px-2 py-1.5 text-[0.82rem] leading-relaxed outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function ArtworkMetadataPanel({
  metadata,
  onChange,
}: ArtworkMetadataPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const patch = (partial: Partial<ArtworkMetadata>) =>
    onChange({ ...metadata, ...partial });

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-6">
      <Field label="Title">
        <input
          className={inputClass}
          placeholder="Optional"
          value={metadata.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Year">
          <input
            type="number"
            className={inputClass}
            value={metadata.year ?? ""}
            onChange={(e) =>
              patch({ year: Number(e.target.value) || undefined })
            }
          />
        </Field>
        <Field label="Process">
          <input
            className={inputClass}
            value={metadata.process ?? ""}
            onChange={(e) => patch({ process: e.target.value })}
          />
        </Field>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="group flex w-full items-center gap-3 py-2 text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)] transition-opacity hover:opacity-100"
          aria-expanded={advancedOpen}
        >
          <span className="h-px flex-1 bg-[var(--border)]" aria-hidden />
          <span
            className={`inline-block text-[0.55rem] opacity-70 transition-transform duration-300 ${advancedOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            ⌄
          </span>
          <span className="whitespace-nowrap">Additional archival metadata</span>
          <span className="h-px flex-1 bg-[var(--border)]" aria-hidden />
        </button>

        {advancedOpen && (
          <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={metadata.date ?? ""}
                onChange={(e) => patch({ date: e.target.value || undefined })}
              />
            </Field>

            <Field label="Medium">
              <input
                className={inputClass}
                placeholder="e.g. watercolor and ink on paper"
                value={metadata.medium ?? ""}
                onChange={(e) => patch({ medium: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Dimensions">
                <input
                  className={inputClass}
                  value={metadata.dimensions ?? ""}
                  onChange={(e) => patch({ dimensions: e.target.value })}
                />
              </Field>
              <Field label="Edition">
                <input
                  className={inputClass}
                  value={metadata.edition ?? ""}
                  onChange={(e) => patch({ edition: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Collection">
              <input
                className={inputClass}
                value={metadata.collection ?? ""}
                onChange={(e) => patch({ collection: e.target.value })}
              />
            </Field>

            <Field label="Post-processing">
              <textarea
                rows={3}
                className={textareaClass}
                placeholder="Archival cleanup, color normalization, scan correction..."
                value={metadata.postProcessing ?? ""}
                onChange={(e) => patch({ postProcessing: e.target.value })}
              />
            </Field>

            <Field label="Capture method">
              <input
                className={inputClass}
                value={metadata.captureMethod ?? ""}
                onChange={(e) => patch({ captureMethod: e.target.value })}
              />
            </Field>

            <Field label="Orientation notes">
              <textarea
                rows={2}
                className={textareaClass}
                value={metadata.orientationNotes ?? ""}
                onChange={(e) => patch({ orientationNotes: e.target.value })}
              />
            </Field>

            <Field label="Artist website">
              <input
                type="url"
                className={inputClass}
                value={metadata.artistWebsite ?? ""}
                onChange={(e) => patch({ artistWebsite: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3">
              <Field label="Archival link">
                <input
                  type="url"
                  className={inputClass}
                  value={metadata.archivalLink ?? ""}
                  onChange={(e) => patch({ archivalLink: e.target.value })}
                />
              </Field>
              <Field label="Transient link">
                <input
                  type="url"
                  className={inputClass}
                  value={metadata.transientLink ?? ""}
                  onChange={(e) => patch({ transientLink: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Discovered forms">
              <textarea
                rows={2}
                className={textareaClass}
                value={metadata.discoveredForms ?? ""}
                onChange={(e) => patch({ discoveredForms: e.target.value })}
              />
            </Field>

            <Field label="Perceptual notes">
              <textarea
                rows={2}
                className={textareaClass}
                value={metadata.perceptualNotes ?? ""}
                onChange={(e) => patch({ perceptualNotes: e.target.value })}
              />
            </Field>

            <Field label="Rotational observations">
              <textarea
                rows={2}
                className={textareaClass}
                value={metadata.rotationalObservations ?? ""}
                onChange={(e) =>
                  patch({ rotationalObservations: e.target.value })
                }
              />
            </Field>
          </div>
        )}
      </div>
    </section>
  );
}

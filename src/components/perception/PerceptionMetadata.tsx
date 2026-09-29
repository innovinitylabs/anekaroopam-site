"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { PerceptualState, PerceptionArtwork } from "@/lib/perception/types";
import { DisplayTitle } from "@/components/site/DisplayTitle";
import {
  displayTitle,
  hasDisplayTitle,
  stateOverlayLines,
} from "@/lib/perception/display";
import { hasTamilScript } from "@/lib/typography/tamil";
import {
  advancedMetadataEntries,
  hasAdvancedMetadata,
  primaryOverlayDetails,
} from "@/lib/perception/metadata";

interface PerceptionMetadataProps {
  artwork: PerceptionArtwork;
  activeState: PerceptualState | null;
  visible: boolean;
  foreground: string;
  /** When false, archival overlay content is hidden (artwork-only mode). */
  overlaysEnabled?: boolean;
  onOverlaysEnabledChange?: (enabled: boolean) => void;
}

export function PerceptionMetadata({
  artwork,
  activeState,
  visible,
  foreground,
  overlaysEnabled = true,
  onOverlaysEnabledChange,
}: PerceptionMetadataProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fields = artwork.overlayFields ?? {
    title: true,
    year: true,
    process: true,
    state: true,
    caption: true,
    advanced: true,
  };

  const title = displayTitle(artwork.metadata.title);
  const { primary, secondary } = stateOverlayLines(activeState);

  const details = primaryOverlayDetails(artwork.metadata, fields);

  const advanced = fields.advanced !== false
    ? advancedMetadataEntries(artwork.metadata)
    : [];

  const showState = fields.state && primary;
  const showCaption =
    fields.caption && secondary && activeState && stateOverlayLines(activeState).secondary;

  const stopCanvasGesture = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-9 pt-16 md:px-10"
      style={{ color: foreground }}
      animate={{ opacity: visible ? 0.72 : 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="pointer-events-auto mb-4 flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            stopCanvasGesture(e);
            onOverlaysEnabledChange?.(!overlaysEnabled);
          }}
          onPointerDown={stopCanvasGesture}
          title={
            overlaysEnabled
              ? "Hide archival overlays for artwork-only viewing."
              : "Show archival overlays and interface text."
          }
          aria-label={
            overlaysEnabled ? "Hide archival overlays" : "Show archival overlays"
          }
          aria-pressed={!overlaysEnabled}
          className="border border-current/25 px-2 py-1 text-[0.58rem] tracking-[0.16em] uppercase opacity-55 transition-opacity hover:opacity-85"
        >
          {overlaysEnabled ? "Artwork only" : "Show overlays"}
        </button>
      </div>

      {overlaysEnabled && (
        <>
          {fields.title && hasDisplayTitle(artwork.metadata.title) && (
            <p
              className={
                hasTamilScript(title)
                  ? "text-[0.95rem] font-anek-tamil-thin tracking-[0.08em] normal-case"
                  : "text-[0.72rem] font-normal tracking-[0.28em] uppercase"
              }
            >
              <DisplayTitle>{title}</DisplayTitle>
            </p>
          )}
          {showState && (
            <p className="mt-2.5 text-[0.95rem] tracking-[0.06em]">{primary}</p>
          )}
          {showCaption && (
            <p className="mt-1.5 max-w-xl text-[0.82rem] leading-relaxed italic opacity-85">
              {secondary}
            </p>
          )}
          {details.length > 0 && (
            <p className="mt-2 text-[0.68rem] tracking-[0.14em] uppercase opacity-55">
              {details.join(" · ")}
            </p>
          )}
          {advanced.length > 0 && hasAdvancedMetadata(artwork.metadata) && (
            <div
              className="pointer-events-auto mt-4 max-w-md"
              onClick={stopCanvasGesture}
              onPointerDown={stopCanvasGesture}
            >
              <button
                type="button"
                onClick={(e) => {
                  stopCanvasGesture(e);
                  setAdvancedOpen((o) => !o);
                }}
                onPointerDown={stopCanvasGesture}
                title="Expand full archival metadata on the viewing canvas."
                aria-expanded={advancedOpen}
                aria-label="Toggle archival record"
                className="flex w-full items-center gap-2 text-[0.58rem] tracking-[0.18em] uppercase opacity-45 transition-opacity hover:opacity-70"
              >
                <span className="h-px flex-1 bg-current opacity-30" />
                <span className={advancedOpen ? "rotate-180" : ""}>⌄</span>
                <span>Archival record</span>
                <span className="h-px flex-1 bg-current opacity-30" />
              </button>
              {advancedOpen && (
                <dl
                  className="mt-3 space-y-2 border-t border-current/10 pt-3 text-[0.72rem] leading-relaxed opacity-60"
                  onClick={stopCanvasGesture}
                  onPointerDown={stopCanvasGesture}
                >
                  {advanced.map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-[0.58rem] tracking-[0.14em] uppercase opacity-70">
                        {label}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

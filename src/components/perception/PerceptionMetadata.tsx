"use client";

import { motion } from "framer-motion";
import type { PerceptualState, PerceptionArtwork } from "@/lib/perception/types";

interface PerceptionMetadataProps {
  artwork: PerceptionArtwork;
  activeState: PerceptualState | null;
  visible: boolean;
  foreground: string;
}

export function PerceptionMetadata({
  artwork,
  activeState,
  visible,
  foreground,
}: PerceptionMetadataProps) {
  const fields = artwork.overlayFields ?? {
    title: true,
    year: true,
    process: true,
    state: true,
    caption: true,
  };

  const details: string[] = [];
  if (fields.year && artwork.metadata.year) {
    details.push(String(artwork.metadata.year));
  }
  if (fields.process && artwork.metadata.process) {
    details.push(artwork.metadata.process);
  }

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-9 pt-16 md:px-10"
      style={{ color: foreground }}
      animate={{ opacity: visible ? 0.72 : 0 }}
      transition={{ duration: 0.5 }}
    >
      {fields.title && (
        <p className="text-[0.72rem] font-normal tracking-[0.28em] uppercase">
          {artwork.metadata.title}
        </p>
      )}
      {fields.state && activeState && (
        <p className="mt-2.5 text-[0.95rem] tracking-[0.06em]">
          {activeState.name}
        </p>
      )}
      {fields.caption && activeState?.caption && (
        <p className="mt-1.5 max-w-xl text-[0.82rem] leading-relaxed italic opacity-85">
          {activeState.caption}
        </p>
      )}
      {details.length > 0 && (
        <p className="mt-2 text-[0.68rem] tracking-[0.14em] uppercase opacity-55">
          {details.join(" · ")}
        </p>
      )}
    </motion.div>
  );
}

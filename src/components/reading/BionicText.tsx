"use client";

import { bionicParts } from "@/lib/bionic";

interface BionicTextProps {
  text: string;
  enabled: boolean;
}

/** Renders plain text with optional bionic bolding (grapheme-aware). */
export function BionicText({ text, enabled }: BionicTextProps) {
  if (!enabled) return <>{text}</>;
  return (
    <>
      {bionicParts(text).map((part, i) =>
        part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}

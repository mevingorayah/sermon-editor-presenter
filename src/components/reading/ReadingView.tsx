"use client";

import type { JSONContent } from "@tiptap/react";
import { renderSermon } from "@/lib/reading/renderSermon";
import type { ReadingTheme } from "@/types/document";
import styles from "./ReadingView.module.css";

interface ReadingViewProps {
  content: JSONContent;
  bionic: boolean;
  /** Theme for the dark-mode contrast policy on user colours. */
  theme?: ReadingTheme;
  /** When true (export preview), omit atmosphere gradient under the column. */
  flattenGradient?: boolean;
  /** Preach stage: screen-scaled pulpit type (not the Calibrate preview). */
  pulpit?: boolean;
}

const classes = {
  title: styles.title,
  h1: styles.h1,
  h2: styles.h2,
  body: styles.body,
  list: styles.list,
  listItem: styles.listItem,
  rule: styles.rule,
  scripture: styles.scripture,
  quoteBlock: styles.quoteBlock,
  quote: styles.quote,
  citation: styles.citation,
  cue: styles.cue,
  titleSub: styles.titleSub,
};

export function ReadingView({
  content,
  bionic,
  theme = "light",
  flattenGradient = false,
  pulpit = false,
}: ReadingViewProps) {
  return (
    <div className={styles.stage} data-pulpit={pulpit ? "" : undefined}>
      {!flattenGradient ? (
        <div className={styles.atmosphere} aria-hidden="true" />
      ) : null}
      <article className={`${styles.column} sermon-marks`}>
        {renderSermon(content, { bionic, theme, classes })}
      </article>
    </div>
  );
}

"use client";

import type { JSONContent } from "@tiptap/react";
import { BionicText } from "./BionicText";
import styles from "./ReadingView.module.css";

interface ReadingViewProps {
  content: JSONContent;
  bionic: boolean;
  /** When true (export preview), omit atmosphere gradient under the column. */
  flattenGradient?: boolean;
}

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(textOf).join("");
}

export function ReadingView({
  content,
  bionic,
  flattenGradient = false,
}: ReadingViewProps) {
  const blocks = content.content ?? [];

  return (
    <div className={styles.stage}>
      {!flattenGradient ? (
        <div className={styles.atmosphere} aria-hidden="true" />
      ) : null}
      <article className={styles.column}>
        {blocks.map((node, i) => {
          const key = `${node.type}-${i}`;
          switch (node.type) {
            case "title":
              return (
                <h1 key={key} className={styles.title}>
                  <BionicText text={textOf(node)} enabled={bionic} />
                </h1>
              );
            case "heading": {
              const level = node.attrs?.level === 2 ? 2 : 1;
              if (level === 1) {
                return (
                  <h2 key={key} className={styles.h1}>
                    <BionicText text={textOf(node)} enabled={bionic} />
                  </h2>
                );
              }
              return (
                <h3 key={key} className={styles.h2}>
                  <BionicText text={textOf(node)} enabled={bionic} />
                </h3>
              );
            }
            case "paragraph":
              return (
                <p key={key} className={styles.body}>
                  <BionicText text={textOf(node)} enabled={bionic} />
                </p>
              );
            case "scripture": {
              const citation =
                typeof node.attrs?.citation === "string" ? node.attrs.citation : "";
              return (
                <blockquote key={key} className={styles.scripture}>
                  {citation ? (
                    <cite className={styles.citation}>{citation}</cite>
                  ) : null}
                  {/* Citation never gets bionic; quote body may */}
                  <p className={styles.quote}>
                    <BionicText text={textOf(node)} enabled={bionic} />
                  </p>
                </blockquote>
              );
            }
            default:
              return null;
          }
        })}
      </article>
    </div>
  );
}

"use client";

import type { OutlineItem } from "@/lib/outline";
import styles from "./OutlineNav.module.css";

interface OutlineNavProps {
  items: OutlineItem[];
  onJump?: (item: OutlineItem) => void;
}

export function OutlineNav({ items, onJump }: OutlineNavProps) {
  return (
    <nav className={styles.root} aria-label="Sermon outline">
      <h2 className={styles.heading}>Outline</h2>
      {items.length === 0 ? (
        <p className={styles.empty}>Add a title or headings to see the outline.</p>
      ) : (
        <ol className={styles.list}>
          {items.map((item) => (
            <li
              key={item.id}
              className={styles[`level${item.level}` as "level0" | "level1" | "level2"]}
            >
              <button
                type="button"
                className={styles.link}
                onClick={() => onJump?.(item)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

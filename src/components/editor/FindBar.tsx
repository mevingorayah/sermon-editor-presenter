"use client";

import { useState } from "react";
import styles from "./FindBar.module.css";

interface FindBarProps {
  /** Stub: highlights are not wired to ProseMirror yet — UI only. */
  onQueryChange?: (q: string) => void;
}

export function FindBar({ onQueryChange }: FindBarProps) {
  const [q, setQ] = useState("");
  return (
    <div className={styles.root} role="search">
      <label className={styles.label} htmlFor="sermon-find">
        Find
      </label>
      <input
        id="sermon-find"
        type="search"
        className={styles.input}
        placeholder="Find in sermon… (stub)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onQueryChange?.(e.target.value);
        }}
      />
    </div>
  );
}

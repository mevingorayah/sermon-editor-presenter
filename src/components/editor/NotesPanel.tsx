"use client";

import styles from "./NotesPanel.module.css";

interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function NotesPanel({ value, onChange }: NotesPanelProps) {
  return (
    <div className={styles.root}>
      <h2 className={styles.heading}>Notes</h2>
      <textarea
        className={styles.area}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Study notes stub…"
        aria-label="Study notes"
        rows={8}
      />
    </div>
  );
}

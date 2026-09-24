"use client";

import styles from "./SermonList.module.css";

export interface SermonListItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface SermonListProps {
  sermons: SermonListItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function SermonList({
  sermons,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  disabled,
}: SermonListProps) {
  return (
    <nav className={styles.root} aria-label="Sermons">
      <div className={styles.header}>
        <h2 className={styles.heading}>Sermons</h2>
        <button
          type="button"
          className={styles.newBtn}
          onClick={onCreate}
          disabled={disabled}
        >
          New
        </button>
      </div>
      {sermons.length === 0 ? (
        <p className={styles.empty}>No sermons yet.</p>
      ) : (
        <ul className={styles.list}>
          {sermons.map((s) => {
            const active = s.id === activeId;
            return (
              <li key={s.id} className={styles.item}>
                <button
                  type="button"
                  className={active ? styles.linkActive : styles.link}
                  onClick={() => onSelect(s.id)}
                  disabled={disabled}
                  aria-current={active ? "true" : undefined}
                >
                  <span className={styles.title}>
                    {s.title || "Untitled sermon"}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => onDelete(s.id)}
                  disabled={disabled}
                  aria-label={`Delete ${s.title || "sermon"}`}
                  title="Delete"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

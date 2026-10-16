"use client";

import { useEffect, useRef } from "react";
import type { ConflictChoice, RestorePreview } from "@/lib/localStore/backup";
import styles from "./StoragePanels.module.css";

export function FirstRunScreen({
  folderApi,
  onChooseFolder,
  onUseBrowser,
  error,
}: {
  folderApi: boolean;
  onChooseFolder: () => void;
  onUseBrowser: () => void;
  error: string | null;
}) {
  return (
    <div className={styles.firstRun} data-edit-mode="" data-testid="first-run">
      <div className={styles.card}>
        <h1 className={styles.h1}>Choose where your sermons are saved</h1>
        {folderApi ? (
          <>
            <p>
              Each sermon is saved as its own file in a folder on your PC, for example{" "}
              <code>Documents/Sermons</code>. Nothing is stored online.
            </p>
            <button type="button" className={styles.primary} onClick={onChooseFolder}>
              Choose folder
            </button>
            <p className={styles.note}>
              Choosing a folder inside Google Drive or OneDrive also gives you a free backup.
            </p>
            {error ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
            <button type="button" className={styles.link} onClick={onUseBrowser}>
              Not now, keep them in this browser
            </button>
          </>
        ) : (
          <>
            <p data-testid="browser-only-note">
              This browser can&apos;t save into a folder, so your sermons are kept in this
              browser on this device. Use <strong>Document → Back up</strong> regularly so you
              always have a copy you can restore.
            </p>
            <button type="button" className={styles.primary} onClick={onUseBrowser}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ConflictPrompt({
  onKeepMine,
  onLoadTheirs,
}: {
  onKeepMine: () => void;
  onLoadTheirs: () => void;
}) {
  return (
    <div className={styles.conflict} role="alertdialog" aria-label="Sermon changed elsewhere">
      <span>
        This sermon was changed in another tab or window. Your latest edits haven&apos;t been
        saved yet.
      </span>
      <button type="button" onClick={onKeepMine}>
        Keep mine
      </button>
      <button type="button" onClick={onLoadTheirs}>
        Load theirs
      </button>
    </div>
  );
}

export function BackupBanner({ onBackup, onDismiss }: { onBackup: () => void; onDismiss: () => void }) {
  return (
    <div className={styles.banner} role="status" data-testid="backup-reminder">
      <span>It&apos;s been more than 7 days since your last backup.</span>
      <button type="button" onClick={onBackup}>
        Back up now
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss backup reminder">
        ×
      </button>
    </div>
  );
}

function Dialog({
  label,
  children,
  onClose,
}: {
  label: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

const CHANGE_LABEL = {
  new: "new",
  newer: "newer than yours",
  older: "older than yours",
  same: "same as yours",
} as const;

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function RestorePreviewDialog({
  preview,
  busy,
  choices,
  onChoice,
  openId,
  openHasUnsavedEdits,
  onApply,
  onCancel,
}: {
  preview: RestorePreview;
  busy: boolean;
  choices: Record<string, ConflictChoice>;
  onChoice: (id: string, c: ConflictChoice) => void;
  openId: string | null;
  openHasUnsavedEdits: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const replacingOpen =
    !!openId && preview.items.some((i) => i.id === openId && i.conflict && choices[i.id] === "replace");
  return (
    <Dialog label="Restore from backup" onClose={onCancel}>
      <h2 className={styles.h2}>Restore from backup</h2>
      <p data-testid="restore-summary">
        This backup from {fmt(preview.backupSavedAt)} has {preview.count}{" "}
        {preview.count === 1 ? "sermon" : "sermons"}.
      </p>
      <ul className={styles.previewList} data-testid="restore-preview">
        {preview.items.map((i) => (
          <li key={i.id} data-restore-id={i.id}>
            <strong>{i.title}</strong>{" "}
            <span className={styles.muted}>
              · {fmt(i.updatedAt)} · {CHANGE_LABEL[i.change]}
            </span>
            {i.conflict ? (
              <fieldset className={styles.choice} aria-label={`${i.title}: a different version is already here`}>
                <label>
                  <input
                    type="radio"
                    name={`c-${i.id}`}
                    checked={(choices[i.id] ?? "keep-both") === "keep-both"}
                    onChange={() => onChoice(i.id, "keep-both")}
                  />{" "}
                  Keep both
                </label>
                <label>
                  <input
                    type="radio"
                    name={`c-${i.id}`}
                    checked={choices[i.id] === "replace"}
                    onChange={() => onChoice(i.id, "replace")}
                  />{" "}
                  Replace
                </label>
              </fieldset>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Nothing you have now is deleted. <strong>Keep both</strong> saves the backup copy as a
        separate sermon with &quot;(restored)&quot; added to its title.
      </p>
      {replacingOpen ? (
        <p role="alert" className={styles.error} data-testid="restore-unsaved-warning">
          {openHasUnsavedEdits
            ? "The sermon you have open has edits that aren't saved yet. Replacing it will keep your edits as a separate copy titled \"(my edits)\"."
            : "This replaces the sermon you have open with the backup copy."}
        </p>
      ) : null}
      <div className={styles.row}>
        <button type="button" className={styles.primary} disabled={busy} onClick={onApply}>
          Restore
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

export function MessageDialog({
  title,
  message,
  details,
  onClose,
}: {
  title: string;
  message: string;
  details?: string[];
  onClose: () => void;
}) {
  return (
    <Dialog label={title} onClose={onClose}>
      <h2 className={styles.h2}>{title}</h2>
      <p role="alert">{message}</p>
      {details?.length ? (
        <ul className={styles.muted}>
          {details.slice(0, 5).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.row}>
        <button type="button" className={styles.primary} onClick={onClose}>
          OK
        </button>
      </div>
    </Dialog>
  );
}

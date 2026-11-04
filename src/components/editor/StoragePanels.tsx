"use client";

import { useEffect, useRef, useState } from "react";
import { replaceConfirmText, resolveReplaceConfirm, type ConflictChoice, type RestorePreview } from "@/lib/localStore/backup";
import { OPEN_ELSEWHERE_TEXT } from "@/lib/localStore/conflict";
import { browserModeBanner } from "@/lib/localStore/status";
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
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div className={styles.conflict} role="alertdialog" aria-label="Sermon changed elsewhere">
      <span>
        This sermon was changed in another tab or window. Your latest edits haven&apos;t been
        saved yet.
      </span>
      <button type="button" ref={keep} onClick={onKeepMine}>
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

export function OpenElsewhereBanner() {
  return (
    <div className={styles.conflict} role="alert" data-testid="open-elsewhere">
      <span>{OPEN_ELSEWHERE_TEXT}. Edit in one tab only, or changes may clash.</span>
    </div>
  );
}

export function BrowserOnlyBanner({ persisted, onBackup }: { persisted: boolean | null; onBackup: () => void }) {
  const b = browserModeBanner(persisted);
  return (
    <div
      className={b.strong ? `${styles.banner} ${styles.warn}` : styles.banner}
      role={b.strong ? "alert" : "status"}
      data-testid="browser-only-banner"
      data-strong={b.strong ? "true" : "false"}
    >
      <span>{b.text}</span>
      <button type="button" onClick={onBackup}>
        Back up now
      </button>
    </div>
  );
}

/** Native modal <dialog>: the browser traps focus; focus returns to the trigger on close. */
function Dialog({
  label,
  children,
  onClose,
  initialFocus,
  role,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Element to focus once the modal is open (default: the browser's choice). */
  initialFocus?: React.RefObject<HTMLElement | null>;
  role?: "alertdialog";
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const focusRef = useRef(initialFocus);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    focusRef.current?.current?.focus();
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      if (d.open) d.close?.();
      const back =
        trigger && trigger.isConnected && trigger !== document.body
          ? trigger
          : document.querySelector<HTMLElement>('[aria-haspopup="menu"]');
      back?.focus();
    };
  }, []);
  return (
    <dialog className={styles.dialog} aria-label={label} ref={ref} role={role} data-testid={testId}>
      {children}
    </dialog>
  );
}

/** Per-sermon confirmation before Replace (ST18). Focus starts on Cancel; Escape = Cancel. */
function ReplaceConfirmDialog({
  title,
  onReplace,
  onCancel,
}: {
  title: string;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog label="Replace sermon?" onClose={onCancel} initialFocus={cancel} role="alertdialog" testId="replace-confirm">
      <p>{replaceConfirmText(title)}</p>
      <div className={styles.row}>
        <button type="button" ref={cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={onReplace}>
          Replace
        </button>
      </div>
    </Dialog>
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
  const [confirming, setConfirming] = useState<{ id: string; title: string } | null>(null);
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
              <fieldset className={styles.choice}>
                <legend className={styles.legend}>{`${i.title || "Untitled sermon"}: a different version is already here`}</legend>
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
                    onChange={() => setConfirming({ id: i.id, title: i.title })}
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
      {confirming ? (
        <ReplaceConfirmDialog
          title={confirming.title}
          onReplace={() => {
            onChoice(confirming.id, resolveReplaceConfirm(true));
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
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

/** In-app confirmation (never window.confirm). Focus starts on Cancel; Escape = Cancel. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog label={title} onClose={onCancel} initialFocus={cancel} role="alertdialog" testId={testId}>
      <h2 className={styles.h2}>{title}</h2>
      <p>{message}</p>
      <div className={styles.row}>
        <button type="button" ref={cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

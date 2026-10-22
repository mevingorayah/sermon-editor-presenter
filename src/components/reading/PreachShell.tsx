"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  resolveActiveDocument,
  updatePresentationSettings,
} from "@/lib/documentStore";
import { typeScaleMultiplier } from "@/lib/calibration";
import type {
  CalibrationTarget,
  LineHeightOption,
  ReadingTheme,
  SermonDocument,
  TypeScaleStep,
} from "@/types/document";
import { ProgressBar } from "./ProgressBar";
import { ReadingToolbar } from "./ReadingToolbar";
import { ReadingView } from "./ReadingView";
import { CalibrationPanel } from "./CalibrationPanel";
import { restoreFocus } from "@/lib/focusReturn";
import styles from "./PreachShell.module.css";

export function PreachShell() {
  const [doc, setDoc] = useState<SermonDocument | null>(null);
  const [progress, setProgress] = useState(0);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  // Deep link from Edit's "Export…": /preach?calibrate=1 opens Document setup.
  const [calibrationDeepLink, setCalibrationDeepLink] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const calibrationToggleRef = useRef<HTMLButtonElement>(null);
  /** Element that opened Document setup; focus returns here on close. */
  const calibrationOpenerRef = useRef<Element | null>(null);
  const wasCalibrationOpen = useRef(false);

  useEffect(() => {
    const wasOpen = wasCalibrationOpen.current;
    wasCalibrationOpen.current = calibrationOpen;
    if (!wasOpen || calibrationOpen) return;
    // Closed: back to the opener. Via ?calibrate=1 the opener (Edit's
    // "Export…" link) lived on another route and is gone, so fall back to
    // the in-page Calibrate toggle, then the sermon's main heading, then body.
    const opener = calibrationOpenerRef.current;
    calibrationOpenerRef.current = null;
    restoreFocus(opener, [
      () => calibrationToggleRef.current,
      () => scrollRef.current?.querySelector("h1") ?? null,
    ]);
  }, [calibrationOpen]);

  useEffect(() => {
    // Q3: Esc closes Document setup; the close effect above restores focus.
    if (!calibrationOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setCalibrationOpen(false);
      setCalibrationDeepLink(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calibrationOpen]);

  useEffect(() => {
    // Read on the client only (no useSearchParams → no Suspense/CSR bailout).
    const params = new URLSearchParams(window.location.search);
    if (params.get("calibrate") === "1") {
      setCalibrationOpen(true);
      setCalibrationDeepLink(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Open exactly the sermon chosen in Edit (?id=<uuid>), else the last
      // explicitly chosen one — never "newest updated".
      const requestedId = new URLSearchParams(window.location.search).get("id");
      const resolved = await resolveActiveDocument({ requestedId, readOnly: true });
      if (cancelled) return;
      setDoc(resolved.doc);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchSettings = useCallback(
    (patch: Partial<SermonDocument["presentationSettings"]>) => {
      setDoc((prev) => {
        if (!prev) return prev;
        return updatePresentationSettings(prev, patch);
      });
    },
    [],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max <= 0 ? 1 : el.scrollTop / max);
  }, []);

  if (!doc) {
    return (
      <div className={styles.boot} data-reading-mode="" data-theme="dark">
        Loading…
      </div>
    );
  }

  const { presentationSettings: ps } = doc;
  const scale = typeScaleMultiplier(ps.typeScaleStep);

  const cssVars = {
    ["--rm-scale"]: String(scale),
    ["--rm-lh-body"]: String(ps.lineHeight),
  } as CSSProperties;

  return (
    <div
      className={styles.shell}
      data-reading-mode=""
      data-theme={ps.theme}
      style={cssVars}
    >
      <ProgressBar progress={progress} />
      <ReadingToolbar
        title={doc.title}
        theme={ps.theme}
        typeScaleStep={ps.typeScaleStep}
        lineHeight={ps.lineHeight}
        bionic={ps.bionic}
        calibrationOpen={calibrationOpen}
        onThemeChange={(theme: ReadingTheme) => patchSettings({ theme })}
        onTypeScaleChange={(typeScaleStep: TypeScaleStep) =>
          patchSettings({ typeScaleStep })
        }
        onLineHeightChange={(lineHeight: LineHeightOption) =>
          patchSettings({ lineHeight })
        }
        onBionicChange={(bionic: boolean) => patchSettings({ bionic })}
        calibrationToggleRef={calibrationToggleRef}
        onToggleCalibration={(trigger) => {
          setCalibrationDeepLink(false);
          if (!calibrationOpen) calibrationOpenerRef.current = trigger;
          setCalibrationOpen((v) => !v);
        }}
      />

      <div className={styles.body}>
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          <ReadingView content={doc.content} bionic={ps.bionic} theme={ps.theme} />
        </div>

        {calibrationOpen ? (
          <CalibrationPanel
            content={doc.content}
            title={doc.title}
            notes={doc.notes ?? ""}
            autoFocus={calibrationDeepLink}
            target={ps.calibrationTarget}
            typeScaleStep={ps.typeScaleStep}
            lineHeight={ps.lineHeight}
            theme={ps.theme}
            onTargetChange={(calibrationTarget: CalibrationTarget) =>
              patchSettings({ calibrationTarget })
            }
            onTypeScaleChange={(typeScaleStep: TypeScaleStep) =>
              patchSettings({ typeScaleStep })
            }
            onLineHeightChange={(lineHeight: LineHeightOption) =>
              patchSettings({ lineHeight })
            }
            onThemeChange={(theme: ReadingTheme) => patchSettings({ theme })}
            onClose={() => {
              setCalibrationOpen(false);
              setCalibrationDeepLink(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

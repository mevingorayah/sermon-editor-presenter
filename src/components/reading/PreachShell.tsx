"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  resolveActiveDocument,
  updatePresentationSettings,
  setActiveSermonId,
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
import { PreachBar, type PreachViewMode } from "./PreachBar";
import { PageView } from "./PageView";
import { PageControls } from "./PageControls";
import {
  deviceDefaultFormat,
  deviceOrientation,
  fromSettings,
  toPatch,
  type PageChoice,
} from "@/lib/reading/pageSettings";
const FOLLOW_KEY = "sermon-editor-presenter:preach-follow-rotation:v1";
import { keepScreenAwake } from "@/lib/reading/wakeLock";
import { fillsScreen } from "@/lib/reading/pageView";
import { pngFrameSize } from "@/lib/sermon/export/pngLayout";

/** Preach view preference (this browser only; not part of the sermon file). */
const VIEW_KEY = "sermon-editor-presenter:preach-view:v1";
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
  const [view, setView] = useState<PreachViewMode>("page");
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "flow" || saved === "page") setView(saved);
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [timer, setTimer] = useState({ running: false, stopped: false });
  // Screen stays on while the timer runs.
  useEffect(() => (timer.running ? keepScreenAwake() : undefined), [timer.running]);

  const changeView = useCallback((v: PreachViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: keep it for this visit */
    }
  }, []);

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
      // Calibrate lives in the ⚙ popover, which is closed by now.
      () => document.querySelector("[data-settings-toggle]"),
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
      // ?id=<uuid> (merges with the "which sermon Preach opens" PR).
      const urlId = new URLSearchParams(window.location.search).get("id");
      if (urlId && /^[0-9a-f-]{36}$/i.test(urlId)) setActiveSermonId(urlId);
      const resolved = await resolveActiveDocument();
      if (cancelled) return;
      setDoc(resolved.doc);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [followDevice, setFollowDevice] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem(FOLLOW_KEY) === "0") setFollowDevice(false);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const changeFollow = useCallback((v: boolean) => {
    setFollowDevice(v);
    try {
      window.localStorage.setItem(FOLLOW_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* unsupported (iPhone Safari): ignore */
    }
  }, []);
  const timerRunningRef = useRef(false);
  timerRunningRef.current = timer.running;

  const patchSettings = useCallback(
    (patch: Partial<SermonDocument["presentationSettings"]>) => {
      setDoc((prev) => {
        if (!prev) return prev;
        return updatePresentationSettings(prev, patch);
      });
    },
    [],
  );

  /** Page setting change: live preview; confirm first while the timer runs. */
  const applyPage = useCallback(
    (c: PageChoice) => {
      if (timerRunningRef.current && !window.confirm("Re-layout pages now?")) return;
      patchSettings(toPatch(c));
    },
    [patchSettings],
  );

  // Follow device rotation (default on); Tablet sideways is the tablet default.
  const docLoaded = Boolean(doc);
  useEffect(() => {
    if (!docLoaded || !followDevice || !viewport.w) return;
    setDoc((prev) => {
      if (!prev) return prev;
      const cur = fromSettings(prev.presentationSettings);
      const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const format = cur.format === "tablet" ? "tablet" : deviceDefaultFormat(viewport.w, viewport.h, touch) ?? cur.format;
      const next = { ...cur, format, orientation: deviceOrientation(viewport.w, viewport.h) };
      const patch = toPatch(next);
      if (patch.calibrationTarget === prev.presentationSettings.calibrationTarget) return prev;
      if (format !== "tablet" && cur.format === format) return prev; // only the Tab rotates today
      return updatePresentationSettings(prev, patch);
    });
  }, [docLoaded, followDevice, viewport.w, viewport.h]);

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
  const choice = fromSettings(ps);
  const scale = typeScaleMultiplier(ps.typeScaleStep);

  const cssVars = {
    ["--rm-scale"]: String(scale),
    ["--rm-lh-body"]: String(ps.lineHeight),
  } as CSSProperties;
  const fill =
    view === "page" &&
    fillsScreen(pngFrameSize(String(ps.calibrationTarget)), viewport.w, viewport.h);

  return (
    <div
      className={styles.shell}
      data-reading-mode=""
      data-theme={ps.theme}
      data-view={view}
      data-stopped={timer.stopped ? "true" : "false"}
      style={cssVars}
    >
      <ProgressBar progress={progress} />
      <PreachBar
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
        view={view}
        onViewChange={changeView}
        overlay={fill}
        onTimerChange={setTimer}
        title={doc.title}
        onTimerStart={() => {
          if (!document.fullscreenElement) toggleFullscreen();
        }}
        pageSection={
          <PageControls
            choice={choice}
            followDevice={followDevice}
            onChange={applyPage}
            onFollowDeviceChange={changeFollow}
            fullscreen={fullscreen}
            onFullscreenToggle={toggleFullscreen}
          />
        }
        onToggleCalibration={(trigger) => {
          setCalibrationDeepLink(false);
          if (!calibrationOpen) calibrationOpenerRef.current = trigger;
          setCalibrationOpen((v) => !v);
        }}
      />

      <div className={styles.body}>
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          {view === "page" ? (
            <PageView
              content={doc.content}
              target={String(ps.calibrationTarget)}
              typeScaleStep={ps.typeScaleStep}
              lineHeight={ps.lineHeight}
              theme={ps.theme}
              fill={fill}
            />
          ) : (
            <ReadingView content={doc.content} bionic={ps.bionic} theme={ps.theme} pulpit />
          )}
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

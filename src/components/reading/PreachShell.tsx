"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { loadDocument, updatePresentationSettings } from "@/lib/documentStore";
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
import styles from "./PreachShell.module.css";

export function PreachShell() {
  const [doc, setDoc] = useState<SermonDocument | null>(null);
  const [progress, setProgress] = useState(0);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDoc(loadDocument());
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
        onToggleCalibration={() => setCalibrationOpen((v) => !v)}
      />

      <div className={styles.body}>
        <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
          <ReadingView content={doc.content} bionic={ps.bionic} />
        </div>

        {calibrationOpen ? (
          <CalibrationPanel
            content={doc.content}
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
            onClose={() => setCalibrationOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

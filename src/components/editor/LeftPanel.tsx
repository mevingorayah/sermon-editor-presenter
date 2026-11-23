"use client";

import type { ReactNode } from "react";
import type { LeftTab } from "@/lib/editLayout/layout";
import styles from "./LeftPanel.module.css";

const TAB_LABEL: Record<LeftTab, string> = { sermons: "Sermons", outline: "Outline", find: "Find" };

function TabIcon({ tab }: { tab: LeftTab }) {
  const common = { width: 18, height: 18, viewBox: "0 0 20 20", "aria-hidden": true, focusable: false } as const;
  if (tab === "sermons")
    return (
      <svg {...common}>
        <rect x="4" y="2.5" width="12" height="15" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (tab === "outline")
    return (
      <svg {...common}>
        <path d="M3 5h2M8 5h9M5 10h2M10 10h7M5 15h2M10 15h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12.5 12.5 17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  open: boolean;
  tab: LeftTab;
  onToggle: () => void;
  onOpenTab: (tab: LeftTab) => void;
  /** All three sections stay mounted (Find keeps its query while hidden). */
  sections: Record<LeftTab, ReactNode>;
}

/**
 * Left Sermons / Outline / Find panel (UI UX spec 1). Collapses to a 48 px
 * icon rail; tapping a rail icon reopens the panel on that tab. Ctrl+\ is
 * wired in EditShell.
 */
export function LeftPanel({ open, tab, onToggle, onOpenTab, sections }: Props) {
  return (
    <aside
      className={styles.panel}
      data-testid="left-panel"
      data-collapsed={open ? "false" : "true"}
      aria-label="Study chrome"
    >
      {open ? (
        <div className={styles.header}>
          <div role="tablist" aria-label="Study panel tabs" className={styles.tabs}>
            {(Object.keys(TAB_LABEL) as LeftTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`left-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`left-section-${t}`}
                className={styles.tab}
                onClick={() => onOpenTab(t)}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.chevron}
            aria-label="Collapse side panel (Ctrl+\)"
            aria-expanded
            aria-keyshortcuts="Control+Backslash"
            title="Collapse (Ctrl+\)"
            data-testid="left-panel-toggle"
            onClick={onToggle}
          >
            <span aria-hidden="true">‹</span>
          </button>
        </div>
      ) : (
        <div className={styles.rail} role="toolbar" aria-orientation="vertical" aria-label="Side panel">
          <button
            type="button"
            className={styles.railBtn}
            aria-label="Expand side panel (Ctrl+\)"
            aria-expanded={false}
            aria-keyshortcuts="Control+Backslash"
            title="Expand (Ctrl+\)"
            data-testid="left-panel-toggle"
            onClick={onToggle}
          >
            <span aria-hidden="true">›</span>
          </button>
          {(Object.keys(TAB_LABEL) as LeftTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={styles.railBtn}
              aria-label={TAB_LABEL[t]}
              title={TAB_LABEL[t]}
              data-testid={`rail-${t}`}
              onClick={() => onOpenTab(t)}
            >
              <TabIcon tab={t} />
            </button>
          ))}
        </div>
      )}
      {(Object.keys(TAB_LABEL) as LeftTab[]).map((t) => (
        <div
          key={t}
          id={`left-section-${t}`}
          role="tabpanel"
          aria-labelledby={`left-tab-${t}`}
          className={styles.section}
          hidden={!open || tab !== t}
        >
          {sections[t]}
        </div>
      ))}
    </aside>
  );
}

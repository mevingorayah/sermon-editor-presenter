"use client";

import {
  useEditor,
  EditorContent,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { useCallback, useMemo, useState } from "react";
import { useEffect } from "react";
import type { PresentationSettings } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { PANEL_KEYS, SHEET_MQ, editPageBox, readFlag, writeFlag } from "@/lib/editLayout/layout";
import { createSermonExtensions } from "@/extensions";
import { BlockBuilder } from "../builder/BlockBuilder";
import { stripDefaultBuilderAttrs, type GlobalStyles } from "@/lib/builder/blockAttrs";
import { FormatToolbar } from "./FormatToolbar";
import styles from "./SermonEditor.module.css";

interface SermonEditorProps {
  content: JSONContent;
  onChange: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor | null) => void;
  /** sermon.globalStyles — saved with the sermon. */
  globalStyles?: GlobalStyles;
  onGlobalStylesChange?: (g: GlobalStyles) => void;
  /** The sermon's page settings: the Edit page keeps this size and orientation. */
  presentationSettings?: PresentationSettings;
}
const NO_GLOBALS: GlobalStyles = {};

export function SermonEditor({
  content,
  onChange,
  onEditorReady,
  globalStyles = NO_GLOBALS,
  onGlobalStylesChange,
  presentationSettings,
}: SermonEditorProps) {
  const ps = presentationSettings ?? DEFAULT_PRESENTATION_SETTINGS;
  const pageKey = JSON.stringify([ps.calibrationTarget, ps.page ?? null]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo(() => editPageBox(ps), [pageKey]);
  /** Formatting panel open state, saved per browser. Default: open unless it is a bottom sheet. */
  const [formattingOpen, setFormattingOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = readFlag(PANEL_KEYS.formatting);
    if (saved === "open") return true;
    if (saved === "closed") return false;
    return !window.matchMedia(SHEET_MQ).matches;
  });
  const setFormatting = useCallback((open: boolean) => {
    setFormattingOpen(open);
    writeFlag(PANEL_KEYS.formatting, open ? "open" : "closed");
  }, []);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createSermonExtensions(),
    content,
    editorProps: {
      attributes: {
        class: styles.prose,
        "aria-label": "Sermon body editor",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(stripDefaultBuilderAttrs(ed.getJSON()));
    },
  });

  // Sync external content (e.g. after load) without clobbering typing
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(stripDefaultBuilderAttrs(editor.getJSON()));
    const next = JSON.stringify(content);
    if (current !== next) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  if (!editor) {
    return <div className={styles.loading}>Loading editor…</div>;
  }

  return (
    <div className={styles.root}>
      <FormatToolbar
        editor={editor}
        formattingOpen={formattingOpen}
        onToggleFormatting={() => setFormatting(!formattingOpen)}
      />
      <BlockBuilder
        editor={editor}
        globalStyles={globalStyles}
        onGlobalStylesChange={(g) => onGlobalStylesChange?.(g)}
        page={page}
        formattingOpen={formattingOpen}
        onFormattingOpenChange={setFormatting}
      >
        <EditorContent editor={editor} />
      </BlockBuilder>
    </div>
  );
}

"use client";

import {
  useEditor,
  EditorContent,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import { BlockBuilder } from "../builder/BlockBuilder";
import { stripDefaultBuilderAttrs, type GlobalStyles } from "@/lib/builder/blockAttrs";

const GLOBAL_STYLES_KEY = "sermon-editor-presenter:builder-global-styles:v1";
import { createSermonExtensions } from "@/extensions";
import { FormatToolbar } from "./FormatToolbar";
import styles from "./SermonEditor.module.css";

interface SermonEditorProps {
  content: JSONContent;
  onChange: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor | null) => void;
}

export function SermonEditor({
  content,
  onChange,
  onEditorReady,
}: SermonEditorProps) {
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

  // sermon.globalStyles: kept client-side until Backend publishes the field.
  const [globalStyles, setGlobalStyles] = useState<GlobalStyles>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GLOBAL_STYLES_KEY);
      if (raw) setGlobalStyles(JSON.parse(raw) as GlobalStyles);
    } catch { /* ignore */ }
  }, []);
  const saveGlobal = (g: GlobalStyles) => {
    setGlobalStyles(g);
    try { localStorage.setItem(GLOBAL_STYLES_KEY, JSON.stringify(g)); } catch { /* ignore */ }
  };

  if (!editor) {
    return <div className={styles.loading}>Loading editor…</div>;
  }

  return (
    <div className={styles.root}>
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Text formatting"
      >
        <div className={styles.toolGroup} role="group" aria-label="Block type">
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor.chain().focus().setNode("title").run()}
          >
            Title
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            H1
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H2
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            Body
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "scripture",
                  attrs: { citation: "" },
                  content: [],
                })
                .run()
            }
          >
            Scripture
          </button>
        </div>
        <FormatToolbar editor={editor} />
      </div>
      <BlockBuilder editor={editor} globalStyles={globalStyles} onGlobalStylesChange={saveGlobal}>
        <EditorContent editor={editor} />
      </BlockBuilder>
    </div>
  );
}

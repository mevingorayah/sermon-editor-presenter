"use client";

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { useEffect } from "react";
import { createSermonExtensions } from "@/extensions";
import styles from "./SermonEditor.module.css";

interface SermonEditorProps {
  content: JSONContent;
  onChange: (json: JSONContent) => void;
}

export function SermonEditor({ content, onChange }: SermonEditorProps) {
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
      onChange(ed.getJSON());
    },
  });

  // Sync external content (e.g. after load) without clobbering typing
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) {
    return <div className={styles.loading}>Loading editor…</div>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar} role="toolbar" aria-label="Block insert">
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
      <EditorContent editor={editor} />
    </div>
  );
}

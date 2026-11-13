"use client";

import { ReactNodeViewRenderer } from "@tiptap/react";
import { VerseSnippet as VerseSnippetSchema } from "@/lib/sermon/verseSnippet";
import { VerseSnippetView } from "./VerseSnippetView";

/**
 * Editor NodeView for `verseSnippet`. The schema node itself lives in
 * `src/lib/sermon/verseSnippet` so unit tests and Preach can load it
 * without CSS modules. The block builder can wrap this node later.
 */
export const VerseSnippet = VerseSnippetSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(VerseSnippetView);
  },
});

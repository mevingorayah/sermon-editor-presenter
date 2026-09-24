import { Extension, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  collectMatches,
  type TextRange,
} from "@/lib/find/collectMatches";

export type SearchAndReplaceStorage = {
  query: string;
  caseSensitive: boolean;
  matches: TextRange[];
  currentIndex: number;
};

type PluginState = { decorations: DecorationSet };

const pluginKey = new PluginKey<PluginState>("sermonSearchAndReplace");

function refreshMatches(
  storage: SearchAndReplaceStorage,
  doc: PMNode,
  preferIndex?: number,
) {
  storage.matches = collectMatches(doc, storage.query, storage.caseSensitive);
  if (storage.matches.length === 0) {
    storage.currentIndex = -1;
    return;
  }
  if (
    preferIndex !== undefined &&
    preferIndex >= 0 &&
    preferIndex < storage.matches.length
  ) {
    storage.currentIndex = preferIndex;
  } else if (
    storage.currentIndex < 0 ||
    storage.currentIndex >= storage.matches.length
  ) {
    storage.currentIndex = 0;
  }
}

function buildDecorations(storage: SearchAndReplaceStorage, doc: PMNode) {
  if (!storage.query || storage.matches.length === 0) {
    return DecorationSet.empty;
  }
  const decorations = storage.matches.map((match, i) =>
    Decoration.inline(match.from, match.to, {
      class:
        i === storage.currentIndex
          ? "sermon-find-match sermon-find-match-current"
          : "sermon-find-match",
    }),
  );
  return DecorationSet.create(doc, decorations);
}

function selectCurrentMatch(editor: Editor, storage: SearchAndReplaceStorage) {
  const match = storage.matches[storage.currentIndex];
  if (!match) return false;
  return editor
    .chain()
    .setTextSelection({ from: match.from, to: match.to })
    .scrollIntoView()
    .run();
}

function selectionOnCurrentMatch(
  editor: Editor,
  storage: SearchAndReplaceStorage,
) {
  const match = storage.matches[storage.currentIndex];
  if (!match) return false;
  const { from, to } = editor.state.selection;
  return from === match.from && to === match.to;
}

function getStorage(editor: Editor): SearchAndReplaceStorage {
  return editor.storage.searchAndReplace;
}

declare module "@tiptap/core" {
  interface Storage {
    searchAndReplace: SearchAndReplaceStorage;
  }

  interface Commands<ReturnType> {
    searchAndReplace: {
      setFindQuery: (query: string) => ReturnType;
      setFindCaseSensitive: (caseSensitive: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceFind: (replaceWith: string) => ReturnType;
      replaceAllFind: (replaceWith: string) => ReturnType;
      clearFind: () => ReturnType;
    };
  }
}

export const SearchAndReplace = Extension.create<
  Record<string, never>,
  SearchAndReplaceStorage
>({
  name: "searchAndReplace",

  addStorage() {
    return {
      query: "",
      caseSensitive: false,
      matches: [],
      currentIndex: -1,
    };
  },

  addCommands() {
    return {
      setFindQuery:
        (query: string) =>
        ({ editor, tr, dispatch }) => {
          const storage = getStorage(editor);
          storage.query = query;
          refreshMatches(storage, editor.state.doc, 0);
          if (dispatch) {
            tr.setMeta(pluginKey, { refresh: true });
            dispatch(tr);
          }
          return true;
        },

      setFindCaseSensitive:
        (caseSensitive: boolean) =>
        ({ editor, tr, dispatch }) => {
          const storage = getStorage(editor);
          storage.caseSensitive = caseSensitive;
          refreshMatches(storage, editor.state.doc, 0);
          if (dispatch) {
            tr.setMeta(pluginKey, { refresh: true });
            dispatch(tr);
          }
          return true;
        },

      findNext:
        () =>
        ({ editor }) => {
          const storage = getStorage(editor);
          if (storage.matches.length === 0) return false;
          if (selectionOnCurrentMatch(editor, storage)) {
            storage.currentIndex =
              (storage.currentIndex + 1) % storage.matches.length;
          }
          editor.view.dispatch(
            editor.state.tr.setMeta(pluginKey, { refresh: true }),
          );
          return selectCurrentMatch(editor, storage);
        },

      findPrevious:
        () =>
        ({ editor }) => {
          const storage = getStorage(editor);
          if (storage.matches.length === 0) return false;
          if (selectionOnCurrentMatch(editor, storage)) {
            storage.currentIndex =
              (storage.currentIndex - 1 + storage.matches.length) %
              storage.matches.length;
          }
          editor.view.dispatch(
            editor.state.tr.setMeta(pluginKey, { refresh: true }),
          );
          return selectCurrentMatch(editor, storage);
        },

      replaceFind:
        (replaceWith: string) =>
        ({ editor, tr, dispatch }) => {
          const storage = getStorage(editor);
          const match = storage.matches[storage.currentIndex];
          if (!match || !dispatch) return false;

          // Text-only replace; never deletes/splits custom block nodes.
          tr.insertText(replaceWith, match.from, match.to);
          tr.setMeta(pluginKey, { refresh: true });
          dispatch(tr);

          if (storage.matches.length > 0) {
            storage.currentIndex = Math.min(
              storage.currentIndex,
              storage.matches.length - 1,
            );
            editor.view.dispatch(
              editor.state.tr.setMeta(pluginKey, { refresh: true }),
            );
            selectCurrentMatch(editor, storage);
          }
          return true;
        },

      replaceAllFind:
        (replaceWith: string) =>
        ({ editor, tr, dispatch }) => {
          const storage = getStorage(editor);
          if (storage.matches.length === 0 || !dispatch) return false;

          // Reverse order so earlier absolute positions stay valid on this tr.
          const ranges = [...storage.matches].reverse();
          for (const { from, to } of ranges) {
            tr.insertText(replaceWith, from, to);
          }
          tr.setMeta(pluginKey, { refresh: true });
          dispatch(tr);
          return true;
        },

      clearFind:
        () =>
        ({ editor, tr, dispatch }) => {
          const storage = getStorage(editor);
          storage.query = "";
          storage.matches = [];
          storage.currentIndex = -1;
          if (dispatch) {
            tr.setMeta(pluginKey, { refresh: true });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      createSearchPlugin(() => this.storage),
    ];
  },
});

function createSearchPlugin(getExtStorage: () => SearchAndReplaceStorage) {
  return new Plugin<PluginState>({
    key: pluginKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty }),
      apply(tr, value, _oldState, newState) {
        const storage = getExtStorage();
        const refreshed = Boolean(tr.getMeta(pluginKey)?.refresh);
        if (!tr.docChanged && !refreshed) {
          return {
            decorations: value.decorations.map(tr.mapping, tr.doc),
          };
        }

        const previousIndex = storage.currentIndex;
        refreshMatches(storage, newState.doc, previousIndex);
        return {
          decorations: buildDecorations(storage, newState.doc),
        };
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

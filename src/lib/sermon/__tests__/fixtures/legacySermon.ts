/** Made-up legacy sermon (no builder styles) used for byte-identity checks. */
import type { CalibratedSnapshot } from "@/types/document";

const T = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const LOREM =
  "Exemple fictif : la lumière du matin traverse la vallée calme, et chacun avance pas à pas sur le chemin. " +
  "Un texte inventé pour tester la mise en page, avec des mots assez longs comme extraordinairement. ";

export function legacySnapshot(extra: Partial<CalibratedSnapshot> = {}): CalibratedSnapshot {
  return {
    target: "screen-16-9",
    margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
    typeScaleStep: 0,
    lineHeight: 1.55,
    theme: "dark",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: [],
    content: {
      type: "doc",
      content: [
        { type: "title", content: [T("Titre d’essai inventé")] },
        { type: "heading", attrs: { level: 1, textAlign: "center" }, content: [T("Première partie")] },
        { type: "paragraph", content: [T(LOREM), T("gras ", [{ type: "bold" }]), T("surligné", [{ type: "highlight" }]), T(" et "), T("rouge", [{ type: "textStyle", attrs: { color: "#B00020" } }])] },
        { type: "scripture", attrs: { citation: "Livre Fictif 1:2-3" }, content: [T(LOREM)] },
        { type: "heading", attrs: { level: 2 }, content: [T("Deuxième point")] },
        { type: "paragraph", attrs: { textAlign: "right" }, content: [T(LOREM.repeat(2))] },
      ],
    } as CalibratedSnapshot["content"],
    ...extra,
  };
}

export const LEGACY_PAGES = [
  {},
  { pageFormat: "letter", orientation: "portrait" },
  { pageFormat: "half-letter", orientation: "portrait", textSizePt: 32 },
] as const;

import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { CANON_BOOKS, getPassage, setBookLoader, type BookJson, type TranslationId } from "../index";

const ROOT = path.join(process.cwd(), "public", "bibles");

before(() => {
  setBookLoader(async (translation, book) => {
    const file = path.join(ROOT, translation, `${book}.json`);
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as BookJson;
  });
});

const LSG_SAMPLES: Array<readonly [string, string, string]> = [
  ["GEN", "1", "Au commencement, Dieu créa les cieux et la terre."],
  ["PSA", "23:1", "Cantique de David. L’Éternel est mon berger: je ne manquerai de rien."],
  ["ISA", "40:8", "L’herbe sèche, la fleur tombe; Mais la parole de notre Dieu subsiste éternellement."],
  ["JER", "29:11", "Car je connais les projets que j’ai formés sur vous, dit l’Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l’espérance."],
  ["MIC", "6:8", "On t’a fait connaître, ô homme, ce qui est bien; Et ce que l’Éternel demande de toi, C’est que tu pratiques la justice, Que tu aimes la miséricorde, Et que tu marches humblement avec ton Dieu."],
  ["MAT", "6:33", "Cherchez premièrement le royaume et la justice de Dieu; et toutes ces choses vous seront données par-dessus."],
  ["JHN", "3:16", "Car Dieu a tant aimé le monde qu’il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu’il ait la vie éternelle."],
  ["ROM", "8:28", "Nous savons, du reste, que toutes choses concourent au bien de ceux qui aiment Dieu, de ceux qui sont appelés selon son dessein."],
  ["1CO", "13:4", "La charité est patiente, elle est pleine de bonté; la charité n’est point envieuse; la charité ne se vante point, elle ne s’enfle point d’orgueil,"],
  ["REV", "21:4", "Il essuiera toute larme de leurs yeux, et la mort ne sera plus, et il n’y aura plus ni deuil, ni cri, ni douleur, car les premières choses ont disparu."],
];

const WEB_SAMPLES: Array<readonly [string, string, string]> = [
  ["GEN", "1:1", "In the beginning, God created the heavens and the earth."],
  ["PSA", "23:1", "A Psalm by David. Yahweh is my shepherd; I shall lack nothing."],
  ["ISA", "40:8", "The grass withers, the flower fades; but the word of our God stands forever.”"],
  ["JER", "29:11", "For I know the thoughts that I think toward you,” says Yahweh, “thoughts of peace, and not of evil, to give you hope and a future."],
  ["MIC", "6:8", "He has shown you, O man, what is good. What does Yahweh require of you, but to act justly, to love mercy, and to walk humbly with your God?"],
  ["MAT", "6:33", "But seek first God’s Kingdom and his righteousness; and all these things will be given to you as well."],
  ["JHN", "3:16", "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life."],
  ["ROM", "8:28", "We know that all things work together for good for those who love God, for those who are called according to his purpose."],
  ["1CO", "13:4", "Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud,"],
  ["REV", "21:4", "He will wipe away every tear from their eyes. Death will be no more; neither will there be mourning, nor crying, nor pain any more. The first things have passed away.”"],
];

function ref(book: string, chv: string): string {
  return chv.includes(":") || chv.includes(".") ? `${book} ${chv}` : `${book} ${chv}:1`;
}

test("ten LSG verses match the eBible VPL source verbatim, including Jean 3.16", async () => {
  assert.equal(LSG_SAMPLES.length, 10);
  for (const [book, chv, text] of LSG_SAMPLES) {
    const verses = await getPassage(ref(book, chv.includes(":") ? chv : `${chv}:1`), "lsg");
    assert.ok(verses && verses.length === 1, book);
    assert.equal(verses![0].text, text, `${book} ${chv}`);
  }
  const jean = await getPassage("Jean 3.16", "lsg");
  assert.equal(jean![0].text, LSG_SAMPLES.find((s) => s[0] === "JHN")![2]);
});

test("ten WEB verses match the eBible VPL source verbatim, including John 3:16", async () => {
  assert.equal(WEB_SAMPLES.length, 10);
  for (const [book, chv, text] of WEB_SAMPLES) {
    const verses = await getPassage(`${book} ${chv}`, "web");
    assert.ok(verses && verses.length === 1, book);
    assert.equal(verses![0].text, text, `${book} ${chv}`);
  }
});

test("getPassage returns numbered verses for a range and null for an invalid ref", async () => {
  const vs = await getPassage("1 Co 13.4-7", "lsg");
  assert.ok(vs);
  assert.deepEqual(vs.map((v) => v.verse), [4, 5, 6, 7]);
  assert.ok(vs.every((v) => v.book === "1CO" && v.chapter === 13 && v.text.length > 0));
  const cross = await getPassage("John 3:16–4:2", "web");
  assert.ok(cross);
  assert.equal(cross[0].chapter, 3);
  assert.equal(cross[0].verse, 16);
  assert.equal(cross[cross.length - 1].chapter, 4);
  assert.equal(cross[cross.length - 1].verse, 2);
  assert.equal(await getPassage("Nope 1:1", "web"), null);
});

test("both translations have 66 books; verse totals match the documented versification", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8")) as {
    translations: Record<TranslationId, { verses: number; versesPerBook: Record<string, number> }>;
  };
  // 31,102 is the usual KJV-style total. See public/bibles/README.md for the diffs.
  assert.equal(manifest.translations.lsg.verses, 31_170);
  assert.equal(manifest.translations.web.verses, 31_103);
  for (const tr of ["lsg", "web"] as const) {
    let total = 0;
    for (const book of CANON_BOOKS) {
      const data = JSON.parse(await readFile(path.join(ROOT, tr, `${book}.json`), "utf8")) as BookJson;
      const n = Object.values(data).reduce((s, ch) => s + Object.keys(ch).length, 0);
      assert.equal(n, manifest.translations[tr].versesPerBook[book], `${tr} ${book}`);
      assert.ok(n > 0, `${tr} ${book} empty`);
      total += n;
    }
    assert.equal(CANON_BOOKS.length, 66);
    assert.equal(total, manifest.translations[tr].verses);
  }
});

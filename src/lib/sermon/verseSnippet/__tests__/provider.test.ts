import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setBookLoader } from "@/lib/bible";
import { bibleGatewayUrl } from "../bibleGateway";
import {
  createFixtureProvider,
  getPassage,
  getPassageProvider,
  setPassageProvider,
} from "../provider";

describe("passage provider hook", () => {
  beforeEach(() => {
    setPassageProvider(null);
    setBookLoader(null);
  });
  afterEach(() => {
    setPassageProvider(null);
    setBookLoader(null);
  });

  it("returns null for bundled refs when no book loader is available (Node without fetch)", async () => {
    const result = await getPassage("Jean 3:16", "LSG");
    assert.equal(result, null);
  });

  it("wires to Backend getPassage for LSG and WEB using a made-up book loader", async () => {
    setBookLoader(async (translation, book) => {
      if (book !== "JHN") return null;
      return {
        "3": {
          "16": translation === "lsg" ? "FAKE LSG verse, not Scripture." : "FAKE WEB verse, not Scripture.",
          "17": translation === "lsg" ? "FAKE LSG 17." : "FAKE WEB 17.",
          "18": translation === "lsg" ? "FAKE LSG 18." : "FAKE WEB 18.",
        },
      };
    });
    const lsg = await getPassage("Jean 3:16", "LSG");
    assert.ok(lsg);
    assert.equal(lsg.text, "FAKE LSG verse, not Scripture.");
    assert.equal(lsg.ref, "Jean 3.16");

    const web = await getPassage("John 3:16", "WEB");
    assert.ok(web);
    assert.equal(web.text, "FAKE WEB verse, not Scripture.");
    assert.equal(web.ref, "John 3:16");

    const range = await getPassage("Jn 3.16-18", "LSG");
    assert.ok(range);
    assert.equal(range.text, "FAKE LSG verse, not Scripture. FAKE LSG 17. FAKE LSG 18.");

    const missing = await getPassage("Jean 1:1", "LSG");
    assert.equal(missing, null);

    const noPaste = await getPassage("Jean 3:16", "ESV");
    assert.equal(noPaste, null);
  });

  it("resolves made-up fixture passages when a test provider is installed", async () => {
    setPassageProvider(createFixtureProvider());
    const lsg = await getPassage("Jean 3:16", "LSG");
    assert.ok(lsg);
    assert.match(lsg.text, /FIXTURE LSG/);

    const web = await getPassageProvider().getPassage("Jn 3:16", "WEB");
    assert.ok(web);
    assert.match(web.text, /FIXTURE WEB/);

    const range = await getPassage("Jn 3.16-18", "LSG");
    assert.ok(range);
    assert.match(range.text, /FIXTURE LSG RANGE/);

    const missing = await getPassage("Jean 1:1", "LSG");
    assert.equal(missing, null);

    const noPaste = await getPassage("Jean 3:16", "ESV");
    assert.equal(noPaste, null);
  });
});

describe("bibleGatewayUrl", () => {
  it("builds an encoded URL for paste translations only, using Backend's English form", () => {
    const url = bibleGatewayUrl("Jean 3:16", "ESV");
    assert.equal(
      url,
      "https://www.biblegateway.com/passage/?search=John+3%3A16&version=ESV",
    );
    const nasb = bibleGatewayUrl("John 3:16-18", "NASB1995");
    assert.ok(nasb);
    assert.match(nasb, /version=NASB1995/);
    assert.match(nasb, /John\+3%3A16/);
    const semeur = bibleGatewayUrl("Jean 3:16", "SEMEUR");
    assert.ok(semeur?.includes("version=BDS"));
    const sg21 = bibleGatewayUrl("Jean 3:16", "SG21");
    assert.ok(sg21?.includes("version=SG21"));
    assert.equal(bibleGatewayUrl("Jean 3:16", "LSG"), null);
    assert.equal(bibleGatewayUrl("Jean 3:16", "WEB"), null);
  });
});

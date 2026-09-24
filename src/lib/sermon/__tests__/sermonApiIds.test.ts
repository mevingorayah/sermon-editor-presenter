import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLegacySeedId,
  isLocalDraftId,
  isServerSermonId,
} from "../../sermonApi";

describe("sermon id helpers (UUID-only API contract)", () => {
  it("accepts crypto.randomUUID shapes", () => {
    assert.equal(
      isServerSermonId("a940f792-34e1-4e33-a507-a267f81ef960"),
      true,
    );
    assert.equal(
      isServerSermonId("00000000-0000-4000-8000-000000000000"),
      true,
    );
  });

  it("rejects seed-*, local-*, and colon-suffixed garbage", () => {
    assert.equal(isServerSermonId("seed-philippians-4"), false);
    assert.equal(isServerSermonId("seed-philippians-4:0"), false);
    assert.equal(isServerSermonId("local-seed"), false);
    assert.equal(isServerSermonId("local-20260924183800"), false);
    assert.equal(isServerSermonId(""), false);
    assert.equal(isServerSermonId(null), false);
  });

  it("classifies local and legacy seed ids", () => {
    assert.equal(isLocalDraftId("local-seed"), true);
    assert.equal(isLocalDraftId("local-20260924183800"), true);
    assert.equal(isLocalDraftId("seed-philippians-4"), false);
    assert.equal(isLegacySeedId("seed-philippians-4"), true);
    assert.equal(isLegacySeedId("seed-philippians-4:0"), true);
    assert.equal(isLegacySeedId("local-seed"), false);
  });
});

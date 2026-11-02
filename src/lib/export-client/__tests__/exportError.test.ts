import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatExportError,
  formatIssue,
  formatIssuePath,
} from "../exportError";

const body = (v: unknown) => JSON.stringify(v);

describe("formatExportError (export 400 → field errors)", () => {
  it("names the failing field from zod-style details", () => {
    const text = formatExportError(
      400,
      body({
        error: "Validation failed",
        details: [
          {
            code: "custom",
            path: ["resolvedColors", "accent"],
            message:
              "Color must be #RRGGBB or rgb(r, g, b). Named colors, #RGB, rgba(), hsl() and CSS var(--…) are not allowed.",
          },
        ],
      }),
    );
    assert.equal(
      text,
      "Export failed: resolvedColors.accent — color must be #RRGGBB or rgb(r, g, b)",
    );
  });

  it("uses the exact mark path embedded in content color messages", () => {
    const text = formatExportError(
      400,
      body({
        error: "Validation failed",
        details: [
          {
            path: ["content"],
            message:
              "content.content[2].content[0].marks[0].color: CSS var(--…) is not allowed in export color marks. Flatten colors to #RRGGBB on the Frontend before POST.",
          },
        ],
      }),
    );
    assert.equal(
      text,
      "Export failed: content.content[2].content[0].marks[0].color — CSS var(--…) is not allowed in export color marks",
    );
  });

  it("caps at 3 issues and appends +N more", () => {
    const details = ["a", "b", "c", "d", "e"].map((f) => ({
      path: [f],
      message: "Required",
    }));
    assert.equal(
      formatExportError(400, body({ error: "Validation failed", details })),
      "Export failed: a — required; b — required; c — required (+2 more)",
    );
    assert.equal(
      formatExportError(400, body({ error: "Validation failed", details: details.slice(0, 3) })),
      "Export failed: a — required; b — required; c — required",
    );
  });

  it("accepts an issues[] array too", () => {
    assert.equal(
      formatExportError(400, body({ issues: [{ path: ["bionic"], message: "Invalid literal value, expected false" }] })),
      "Export failed: bionic — invalid literal value, expected false",
    );
  });

  it("non-validation 400 (no issues) shows the error string", () => {
    assert.equal(
      formatExportError(
        400,
        body({
          error: 'Invalid format "gif". Expected one of: docx, pdf, png, pptx.',
          details: { code: "INVALID_FORMAT" },
        }),
      ),
      'Export failed: invalid format "gif". Expected one of: docx, pdf, png, pptx',
    );
  });

  it("generic fallback when the body doesn't parse or is empty", () => {
    assert.equal(
      formatExportError(400, "<html>Bad Request</html>", "Bad Request"),
      "Export failed (HTTP 400 Bad Request). Please try again.",
    );
    assert.equal(
      formatExportError(502, ""),
      "Export failed (HTTP 502). Please try again.",
    );
    assert.equal(
      formatExportError(400, body({ details: "nope" })),
      "Export failed (HTTP 400). Please try again.",
    );
  });

  it("path helpers", () => {
    assert.equal(formatIssuePath(["semanticBlocks", 3, "text"]), "semanticBlocks[3].text");
    assert.equal(formatIssuePath([]), "");
    assert.equal(formatIssuePath(undefined), "");
    assert.equal(formatIssue({ path: [], message: "Expected object, received null" }), "expected object, received null");
    assert.equal(formatIssue({ path: ["x"] }), "x — invalid");
    const long = formatIssue({ path: ["notes"], message: "x".repeat(300) });
    assert.ok(long.length < 140 && long.endsWith("…"));
  });
});

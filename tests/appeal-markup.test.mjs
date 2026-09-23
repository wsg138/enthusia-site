import assert from "node:assert/strict";
import test from "node:test";

import { appealPlainText, parseAppealBlock } from "../public/assets/appeal-markup.js";

test("appeal block parsing recognizes supported player formatting", () => {
  assert.deepEqual(parseAppealBlock("##  Review this"), {
    kind: "heading",
    level: 2,
    content: "Review this"
  });
  assert.deepEqual(parseAppealBlock("> quoted text"), { kind: "quote", content: "quoted text" });
  assert.deepEqual(parseAppealBlock("- list item"), { kind: "unordered-item", content: "list item" });
  assert.deepEqual(parseAppealBlock("12) ordered item"), { kind: "ordered-item", content: "ordered item" });
  assert.equal(parseAppealBlock("#### not a supported heading"), null);
  assert.equal(parseAppealBlock("-"), null);
});

test("appeal block parsing handles long malformed markers without regular-expression backtracking", () => {
  const malformedHeading = `${"#".repeat(40000)} text`;
  const malformedList = `${"9".repeat(40000)}x text`;
  assert.equal(parseAppealBlock(malformedHeading), null);
  assert.equal(parseAppealBlock(malformedList), null);
  assert.equal(appealPlainText("## **Important**\n- first point"), "Important first point");
});

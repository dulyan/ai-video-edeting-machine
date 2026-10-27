import { test } from "node:test";
import assert from "node:assert/strict";
import { PromptParser } from "../server/prompt-parser.ts";
import { apiHeaders } from "../shared/http.ts";
test("plain prompts retain embedded JSON instead of extracting it as a second response", () => {
  const prompts: string[] = [];
  const parser = new PromptParser(
    (p) => prompts.push(p),
    () => {},
  );
  const text =
    'Draw a sign showing {"prompt":"inside the sign"}.\nKeep the background unchanged.';
  parser.push(text);
  parser.finish();
  assert.deepEqual(prompts, [text]);
});
for (const [label, text, expected] of [
  [
    "pretty printed JSON",
    '{\n  "prompt": "First line\\nSecond line"\n}',
    ["First line\nSecond line"],
  ],
  [
    "literal multiline string",
    '{"prompt":"First line\nSecond line"}',
    ["First line\nSecond line"],
  ],
  [
    "fenced JSON",
    '```json\n{\n"prompt": "A candid portrait"\n}\n```',
    ["A candid portrait"],
  ],
  [
    "array wrapper",
    '{"prompts":["Red shirt","Blue shirt"]}',
    ["Red shirt", "Blue shirt"],
  ],
  [
    "plain multiline prompt",
    "Create a candid portrait.\nKeep the room unchanged.",
    ["Create a candid portrait.\nKeep the room unchanged."],
  ],
  [
    "embedded quoted JSON",
    JSON.stringify({
      prompt: 'A sign reading {"prompt":"keep this inside the image"}.',
    }),
    ['A sign reading {"prompt":"keep this inside the image"}.'],
  ],
  ["NDJSON", '{"prompt":"One"}\n{"prompt":"Two"}\n', ["One", "Two"]],
] as const)
  test(`prompt parser accepts ${label} across arbitrary stream chunks`, () => {
    const prompts: string[] = [],
      drafts: string[] = [];
    const p = new PromptParser(
      (t) => prompts.push(t),
      (t) => drafts.push(t),
    );
    for (let at = 0; at < text.length; at += 3) p.push(text.slice(at, at + 3));
    p.finish();
    assert.deepEqual(prompts, expected);
  });
test("incomplete JSON fails without discarding earlier completed prompts", () => {
  const prompts: string[] = [];
  const p = new PromptParser(
    (t) => prompts.push(t),
    () => {},
  );
  p.push('{"prompt":"Complete"}\n{"prompt":"Incomplete');
  p.finish();
  assert.deepEqual(prompts, ["Complete"]);
  const broken = new PromptParser(
    () => {},
    () => {},
  );
  broken.push('{\n "prompt":"Incomplete');
  assert.throws(() => broken.finish(), /incomplete prompt JSON/);
});
test("bodyless actions do not send JSON content type; JSON and multipart keep correct headers", () => {
  assert.equal(
    apiHeaders({ method: "POST" }, "token").get("Content-Type"),
    null,
  );
  assert.equal(
    apiHeaders({ method: "GET" }, "token").get("Content-Type"),
    null,
  );
  assert.equal(
    apiHeaders(
      { method: "POST", body: JSON.stringify({ name: "test" }) },
      "token",
    ).get("Content-Type"),
    "application/json",
  );
  assert.equal(
    apiHeaders({ method: "POST", body: new FormData() }, "token").get(
      "Content-Type",
    ),
    null,
  );
  assert.equal(
    apiHeaders({ headers: new Headers({ "X-Test": "yes" }) }, "token").get(
      "X-Test",
    ),
    "yes",
  );
});

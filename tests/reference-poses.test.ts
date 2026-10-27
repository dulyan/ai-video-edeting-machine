import { referencePosesSchema } from "../shared/schema.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  poseEntries,
  generationPoses,
  formatPoses,
} from "../shared/reference-poses.ts";
test("legacy lines become individual editors while array entries preserve internal line breaks", () => {
  assert.deepEqual(poseEntries("  Pose one.\r\n\r\nPose two.  "), [
    "  Pose one.",
    "Pose two.  ",
  ]);
  const poses = ["Pose one.\nExpression: delighted.", "Pose two.", ""];
  assert.deepEqual(poseEntries(poses), poses);
  assert.deepEqual(generationPoses(poses), poses.slice(0, 2));
  assert.equal(
    formatPoses(poses),
    "Pose 1:\nPose one.\nExpression: delighted.\n\nPose 2:\nPose two.",
  );
  assert.deepEqual(poseEntries(undefined), []);
  assert.equal(referencePosesSchema.safeParse(poses).success, true);
  assert.equal(
    referencePosesSchema.safeParse(["x".repeat(10001), "x".repeat(10000)])
      .success,
    false,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../shared/project.ts";
import type { AppState } from "../shared/types.ts";
import { WorkspaceDrafts } from "../src/workspace-sync.ts";

function fixture(revision = 1): AppState {
  return { revision, projects: [newProject()], assets: [], products: [], jobs: [], presets: [] };
}

test("late SSE and GET snapshots cannot undo acknowledged text, navigation or selections", () => {
  const drafts = new WorkspaceDrafts();
  let state = fixture();
  const id = state.projects[0].id;
  const stale = structuredClone(state);
  drafts.edit(id, { step: 6, musicIds: ["m1"], imagePrompt: "Keep the entire new text" });
  const sent = drafts.capture(id);
  state = drafts.accept(state, { ...stale, revision: 2 });
  assert.equal(state.projects[0].step, 6);
  drafts.acknowledge(id, sent, 3);
  const retained = drafts.accept(state, { ...stale, revision: 2 });
  assert.equal(retained, state);
  assert.equal(retained.projects[0].imagePrompt, "Keep the entire new text");
  assert.deepEqual(retained.projects[0].musicIds, ["m1"]);
  state = drafts.accept(state, { ...stale, revision: 3, projects: [{ ...stale.projects[0], ...sent.patch }] });
  assert.equal(drafts.saving, false);
  assert.equal(drafts.accept(state, stale), state);
});

test("edits made during a slow save survive its acknowledgement and live hook updates still arrive", () => {
  const drafts = new WorkspaceDrafts();
  let state = fixture();
  const project = state.projects[0];
  drafts.edit(project.id, { name: "First", step: 1 });
  const first = drafts.capture(project.id);
  drafts.edit(project.id, { name: "Second, newer edit", demoIds: ["d2"] });
  drafts.acknowledge(project.id, first, 2);
  const hook = {id: "h", text: "New hook from completed job", createdAt: ""};
  state = drafts.accept(state, { ...state, revision: 2, projects: [{ ...project, name: "First", step: 1, hooks: [hook] }] });
  assert.equal(state.projects[0].name, "Second, newer edit");
  assert.deepEqual(state.projects[0].demoIds, ["d2"]);
  assert.deepEqual(state.projects[0].hooks, [hook]);
  assert.deepEqual(drafts.capture(project.id).patch, { name: "Second, newer edit", demoIds: ["d2"] });
  assert.equal(state.projects[0].step, 1);
});

test("offline edits survive reload and are still unsaved after an unsuccessful request", () => {
  const drafts = new WorkspaceDrafts();
  const state = fixture(), id = state.projects[0].id;
  drafts.edit(id, { name: "Offline draft", reactionIds: ["r1", "r3"] });
  const resumed = new WorkspaceDrafts(JSON.parse(JSON.stringify(drafts.serialize())));
  const reconciled = resumed.accept(state, state);
  assert.equal(reconciled.projects[0].name, "Offline draft");
  assert.deepEqual(reconciled.projects[0].reactionIds, ["r1", "r3"]);
  assert.equal(resumed.hasUnsaved(id), true);
  assert.deepEqual(resumed.capture(id).patch, drafts.capture(id).patch);
});

test("in-flight project creation is retained and unrelated job events reuse editable record references", () => {
  const drafts = new WorkspaceDrafts();
  let state = fixture();
  drafts.localIds.add(state.projects[0].id);
  const project = state.projects[0];
  state = drafts.accept(state, { ...state, revision: 2, projects: [] });
  assert.equal(state.projects[0], project);
  state = drafts.accept(state, { ...state, revision: 3 });
  assert.equal(drafts.saving, false);
  const next = drafts.accept(state, { ...structuredClone(state), revision: 4 });
  assert.equal(next.projects, state.projects);
  assert.equal(next.products, state.products);
  assert.equal(next.assets, state.assets);
});

test("a new edit after an acknowledgement is protected even if another write had the same value", () => {
  const drafts = new WorkspaceDrafts(), state = fixture(), id = state.projects[0].id;
  drafts.edit(id, { musicIds: ["m1"] });
  const first = drafts.capture(id);
  drafts.edit(id, { musicIds: [] });
  drafts.acknowledge(id, first, 2);
  const next = drafts.accept(state, { ...state, revision: 2, projects: [{ ...state.projects[0], musicIds: ["m1"] }] });
  assert.deepEqual(next.projects[0].musicIds, []);
  assert.equal(drafts.hasUnsaved(id), true);
});

test("product and preset edits survive offline reload and older live updates", () => {
  const drafts = new WorkspaceDrafts(), state = fixture();
  const product = {id:"product",internalName:"Edited product",externalName:"Brand",url:"",painPoints:"Keep these facts",costOfInaction:"",solution:"",proof:""};
  const preset = {id:"preset",name:"Edited preset",mode:"image" as const,prompt:"Exact updated instructions",fixedInstructions:"  Exact whitespace.\n"};
  drafts.editRecord("products",product);
  drafts.editRecord("presets",preset);
  const restored = new WorkspaceDrafts(JSON.parse(JSON.stringify(drafts.serialize())));
  const merged = restored.accept(state,{...state,revision:2});
  assert.deepEqual(merged.products,[product]);
  assert.deepEqual(merged.presets,[preset]);
  const sent = restored.pendingRecords("products")[0];
  restored.acknowledgeRecord("products",sent,3);
  assert.equal(restored.accept(merged,{...state,revision:2}),merged);
  const final = restored.accept(merged,{...state,revision:3,products:[product]});
  assert.deepEqual(final.products,[product]);
  assert.equal(restored.pendingRecords("products").length,0);
  assert.deepEqual(final.presets,[preset]);
});

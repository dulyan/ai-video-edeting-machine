import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {newProject} from "../shared/project.ts";
import {projectSchema} from "../shared/schema.ts";
import {HOOK_FONTS, effectiveHookFont} from "../shared/hook-fonts.ts";
import {hookWritingSystem} from "../shared/hook-virality.ts";

test("font and virality settings validate and retain backward compatibility",()=>{
  const p=newProject();
  for(const hookVirality of [1,5,10]) assert(projectSchema.safeParse({...p,hookVirality}).success);
  for(const hookVirality of [0,11,1.5]) assert(!projectSchema.safeParse({...p,hookVirality}).success);
  assert(!projectSchema.safeParse({...p,composition:{...p.composition,fontId:"injected,ASS"}}).success);
  const {hookVirality,...legacy}=p; delete legacy.composition.fontId;
  assert(projectSchema.safeParse(legacy).success);
});
test("all ten bundled font files match their provenance checksums and include licenses",async()=>{
  const manifest=JSON.parse(await readFile("public/fonts/manifest.json","utf8"));
  assert.equal(HOOK_FONTS.length,10);
  for(const font of HOOK_FONTS){
    const bytes=await readFile(`public/fonts/${font.file}`);
    assert.equal(bytes.readUInt32BE(),0x00010000);
    const entry=manifest.fonts.find((f:any)=>f.id===font.id);
    assert.equal(createHash("sha256").update(bytes).digest("hex"),entry.sha256);
    assert.match(await readFile(`public/fonts/${font.id}-OFL.txt`,"utf8"),/SIL OPEN FONT LICENSE/);
  }
});
test("Cyrillic fallback and industry curiosity policy are explicit",()=>{
  assert.equal(effectiveHookFont("anton","Hello").id,"anton");
  assert.equal(effectiveHookFont("anton","\u041f\u0440\u0438\u0432\u0435\u0442").id,"oswald");
  assert.equal(effectiveHookFont("poppins","\u041f").id,"montserrat");
  assert.match(hookWritingSystem(1),/Neutral and product-focused/);
  assert.match(hookWritingSystem(10),/Maximum curiosity, industry-first/);
  assert.match(hookWritingSystem(10),/Never invent statistics/);
});

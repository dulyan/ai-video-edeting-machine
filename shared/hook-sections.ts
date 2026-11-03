import type {Composition,Hook,HookTextStyle,TextSectionSettings} from "./types.ts";
import {activeHookFontId} from "./hook-fonts.ts";
import {hookPositionFraction} from "./hook-layout.ts";
export function textPosition(c:Composition) {return c.textPosition ?? hookPositionFraction(c.position)*100;}
export function textWidth(c:Composition) {return c.textWidth ?? (c.style==="Text Wall"?62:90);}
export function hookHasText(h:Hook) {return !!h.text.trim() || !!h.sections?.some(s=>s.text.trim());}
export function sectionDefaults(h:Hook,c:Composition) {
 const fontId=h.fontId ?? c.fontId;
 return {fontId:c.textLayoutVersion===3?activeHookFontId(fontId):fontId,fontSize:c.fontSize,widthPercent:textWidth(c),verticalOffset:0,style:(c.style==="IMG"?"Text":c.style) as HookTextStyle};
}
export function hookSections(h:Hook,c:Composition) {
 const base=sectionDefaults(h,c);
 const resolve=(settings?:TextSectionSettings)=>{
   const merged={...base,...Object.fromEntries(Object.entries(settings || {}).filter(([,v])=>v!==undefined))};
   if(c.textLayoutVersion===3)merged.fontId=activeHookFontId(merged.fontId);
   return merged;
 };
 return [{id:h.id,text:h.text,settings:resolve(h.textSettings)},...(h.sections || []).map(s=>({...s,settings:resolve(s.settings)}))].filter(s=>s.text.trim());
}

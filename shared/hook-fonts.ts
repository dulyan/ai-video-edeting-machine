export const HOOK_FONT_IDS = ["montserrat","poppins","anton","bebas-neue","oswald","inter","roboto","open-sans","playfair-display","caveat"] as const;
export type HookFontId = typeof HOOK_FONT_IDS[number];
export const DEFAULT_HOOK_FONT: HookFontId = "montserrat";
export const HOOK_FONTS: {id:HookFontId;name:string;family:string;file:string;weight:number;cyrillic:boolean;fallback?:HookFontId}[] = [
  {id:"montserrat",name:"Montserrat Bold",family:"Montserrat",file:"montserrat.ttf",weight:700,cyrillic:true},
  {id:"poppins",name:"Poppins Bold",family:"Poppins",file:"poppins.ttf",weight:700,cyrillic:false,fallback:"montserrat"},
  {id:"anton",name:"Anton",family:"Anton",file:"anton.ttf",weight:400,cyrillic:false,fallback:"oswald"},
  {id:"bebas-neue",name:"Bebas Neue",family:"Bebas Neue",file:"bebas-neue.ttf",weight:400,cyrillic:false,fallback:"oswald"},
  {id:"oswald",name:"Oswald Bold",family:"Oswald",file:"oswald.ttf",weight:700,cyrillic:true},
  {id:"inter",name:"Inter Bold",family:"Inter",file:"inter.ttf",weight:700,cyrillic:true},
  {id:"roboto",name:"Roboto Bold",family:"Roboto",file:"roboto.ttf",weight:700,cyrillic:true},
  {id:"open-sans",name:"Open Sans Bold",family:"Open Sans",file:"open-sans.ttf",weight:700,cyrillic:true},
  {id:"playfair-display",name:"Playfair Display Bold",family:"Playfair Display",file:"playfair-display.ttf",weight:700,cyrillic:true},
  {id:"caveat",name:"Caveat Bold",family:"Caveat",file:"caveat.ttf",weight:700,cyrillic:true},
];
export function hookFont(id?:string) { return HOOK_FONTS.find(font=>font.id===id)||HOOK_FONTS[0]; }
// Select a complete compatible family for Cyrillic text, rather than silently
// mixing unmatched glyphs. Both the browser and FFmpeg use this same decision.
export function effectiveHookFont(id:HookFontId|undefined,text:string) {
  const font=hookFont(id);
  return /[\u0400-\u052f]/u.test(text) && !font.cyrillic ? hookFont(font.fallback) : font;
}
export function hookFontCSS(id:HookFontId|undefined,text:string) {
  const font=effectiveHookFont(id,text);
  return {fontFamily:`"AVEM ${font.family}", sans-serif`,fontWeight:font.weight};
}

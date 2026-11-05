export const LEGACY_HOOK_FONT_IDS = ["montserrat","poppins","anton","bebas-neue","oswald","inter","roboto","open-sans","playfair-display","caveat","instagram-default","tiktok-default"] as const;
export const ACTIVE_HOOK_FONT_IDS = ["classic-iphone-helvetica","tiktok-classic-ru","tiktok-classic-legacy"] as const;
export const HOOK_FONT_IDS = [...ACTIVE_HOOK_FONT_IDS,...LEGACY_HOOK_FONT_IDS] as const;
export type HookFontId = typeof HOOK_FONT_IDS[number];
export type ActiveHookFontId = typeof ACTIVE_HOOK_FONT_IDS[number];
export const DEFAULT_HOOK_FONT: ActiveHookFontId = "tiktok-classic-ru";
export const LEGACY_HOOK_FONTS: {id:HookFontId;name:string;family:string;file:string;weight:number;cyrillic:boolean;fallback?:HookFontId;local?:boolean}[] = [
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
 {id:'instagram-default',name:'Legacy Instagram-style Sans',family:'Manrope',file:'instagram-default.ttf',weight:600,cyrillic:true},
 {id:'tiktok-default',name:'Legacy TikTok Sans',family:'TikTok Sans',file:'tiktok-default.ttf',weight:600,cyrillic:true},
];
export const HOOK_FONTS = [
 {id:'classic-iphone-helvetica' as const,name:'iPhone Classic reference - Helvetica Roman',family:'Helvetica Reference',file:'helvetica-roman.otf',weight:400,cyrillic:true,group:'TikTok',local:true},
 {id:'tiktok-classic-ru' as const,name:'TikTok Sans (previous font)',family:'TikTok Sans',file:'tiktok-default.ttf',weight:600,cyrillic:true,group:'TikTok',local:false},
 {id:'tiktok-classic-legacy' as const,name:'Proxima Nova Semibold (alternative)',family:'Proxima Nova',file:'proxima-nova-semibold.otf',weight:600,cyrillic:true,group:'TikTok',local:true},
];
export function activeHookFontId(id?:string):ActiveHookFontId { return ACTIVE_HOOK_FONT_IDS.includes(id as ActiveHookFontId) ? id as ActiveHookFontId : DEFAULT_HOOK_FONT; }
export function v3HookFontId(id?:string):HookFontId {return id==='tiktok-default'?'tiktok-default':'instagram-default';}
export function hookFont(id?:string) { return HOOK_FONTS.find(font=>font.id===id)||LEGACY_HOOK_FONTS.find(font=>font.id===id)||HOOK_FONTS.find(font=>font.id===DEFAULT_HOOK_FONT)!; }
// Select a complete compatible family for Cyrillic text, rather than silently
// mixing unmatched glyphs. Both the browser and FFmpeg use this same decision.
export function effectiveHookFont(id:HookFontId|undefined,text:string) {
  const font=hookFont(id);
  return /[\u0400-\u052f]/u.test(text) && !font.cyrillic ? hookFont("fallback" in font ? font.fallback : undefined) : font;
}
export function hookFontCSS(id:HookFontId|undefined,text:string) {
  const font=effectiveHookFont(id,text);
  return {fontFamily:`"AVEM ${font.family}", sans-serif`,fontWeight:font.weight};
}

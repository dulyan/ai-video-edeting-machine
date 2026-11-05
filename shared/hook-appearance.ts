import type {Composition,HookStyle} from './types.ts';
import {activeHookFontId} from './hook-fonts.ts';
export const TEXT_APPEARANCES = ['plain','outline','white-box','grey-box'] as const;
export type TextAppearance = typeof TEXT_APPEARANCES[number];
export const APPEARANCE_LABELS: Record<TextAppearance,string> = {
 plain:'White text', outline:'White text / black outline',
 'white-box':'White underlay / black text', 'grey-box':'Grey underlay / white text',
};
export const HOOK_STYLES = ['Text','Snapchat','IMG','Text Wall','Green screen'] as const;
export function currentHookStyle(style:HookStyle) {return style==='Instagram'?'Text':style;}
export function defaultAppearance(style:HookStyle):TextAppearance {return style==='Instagram'?'white-box':style==='Snapchat'?'grey-box':'outline';}
/** New edits and renders use v4; existing job snapshots keep their original layout. */
export function currentHookComposition(c:Composition):Composition {
 return {...c,style:currentHookStyle(c.style),textLayoutVersion:4,fontId:activeHookFontId(c.fontId),textAppearance:c.textAppearance??defaultAppearance(c.style)};
}

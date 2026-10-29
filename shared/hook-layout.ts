export const HOOK_POSITIONS = ["top", "upper-middle", "middle", "lower-middle", "bottom"] as const;
export type HookPosition = typeof HOOK_POSITIONS[number];
export const HOOK_POSITION_LABELS: Record<HookPosition,string> = {top:"Top","upper-middle":"Upper middle",middle:"Middle","lower-middle":"Lower middle",bottom:"Bottom"};
export function hookPositionFraction(position:HookPosition) { return {top:0.18,"upper-middle":0.32,middle:0.46,"lower-middle":0.63,bottom:0.8}[position]; }

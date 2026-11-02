/** Detect pictographs, flags and keycaps without splitting joined sequences. */
export function hasHookEmoji(text:string) {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(text);
}

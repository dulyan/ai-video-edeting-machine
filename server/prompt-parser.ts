// JSON prompts may span any number of lines/chunks. Never split a prompt at a newline.
export class PromptParser {
  private text = "";
  private emitted = 0;
  private values: string[] = [];
  constructor(
    private onPrompt: (prompt: string) => void,
    private onDraft: (draft: string) => void,
  ) {}
  push(chunk: string) {
    this.text += chunk;
    if (this.text.length > 250000)
      throw new Error("The text model response was too large");
    this.scan();
  }
  private strings(start: number, array = false) {
    let at = start;
    while (at < this.text.length) {
      while (/\s|,/.test(this.text[at] || "") && at < this.text.length) at++;
      if (this.text[at] !== '"') return;
      const begin = ++at;
      let escaped = false;
      for (; at < this.text.length; at++) {
        const c = this.text[at];
        if (c === '"' && !escaped) break;
        if (c === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
      const raw = this.text.slice(begin, at);
      if (at >= this.text.length) {
        this.onDraft(this.decode(raw, true));
        return;
      }
      let next = at + 1;
      while (next < this.text.length && /\s/.test(this.text[next])) next++;
      if (next >= this.text.length) {
        this.onDraft(this.decode(raw, true));
        return;
      }
      if (!/[,}\]]/.test(this.text[next]))
        throw new Error(
          "The text model returned malformed prompt JSON. Completed prompts are saved.",
        );
      this.values.push(this.decode(raw));
      at++;
      if (!array) return;
    }
  }
  private decode(raw: string, partial = false) {
    // Tolerate literal newlines inside a JSON string as well as correctly escaped ones.
    const cleaned = raw.replace(/[\u0000-\u001f]/g, (c) =>
      JSON.stringify(c).slice(1, -1),
    );
    try {
      return JSON.parse('"' + cleaned + '"');
    } catch {
      if (!partial)
        throw new Error(
          "The text model returned an incomplete JSON prompt. Completed prompts are saved.",
        );
      return raw
        .replaceAll("\\n", "\n")
        .replaceAll('\\"', '"')
        .replace(/\\$/, "");
    }
  }
  private scan() {
    this.values = [];
    const plain = this.text.trimStart().replace(/^```(?:json|text)?\s*/, "");
    if (plain && !/^[\[{]/.test(plain)) {
      this.onDraft(plain);
      return;
    }
    // Scan keys outside quoted strings, so a prompt containing JSON is not treated as metadata.
    let at = 0;
    while (at < this.text.length) {
      if (this.text[at] !== '"') {
        at++;
        continue;
      }
      const begin = at++;
      let escaped = false;
      for (; at < this.text.length; at++) {
        if (this.text[at] === '"' && !escaped) break;
        if (this.text[at] === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
      if (at >= this.text.length) break;
      const key = this.text.slice(begin + 1, at);
      at++;
      if (!["prompt", "prompts"].includes(key)) continue;
      while (/\s/.test(this.text[at] || "") && at < this.text.length) at++;
      if (this.text[at++] !== ":") continue;
      while (/\s/.test(this.text[at] || "") && at < this.text.length) at++;
      if (key === "prompts" && this.text[at] === "[") {
        this.strings(at + 1, true);
      } else if (key === "prompt") {
        this.strings(at);
      }
    }
    while (this.emitted < this.values.length) {
      const prompt = this.values[this.emitted++].trim();
      if (!prompt) throw new Error("The text model returned an empty prompt");
      this.onPrompt(prompt);
    }
    if (
      !/[\[{]/.test(this.text.trimStart()[0] || "") &&
      !this.text.trimStart().startsWith("```")
    )
      this.onDraft(this.text);
  }
  finish() {
    this.scan();
    if (!this.emitted) {
      const plain = this.text
        .replace(/^\s*```(?:json|text)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      // A single plain multiline prompt is a supported output; malformed JSON is not silently accepted.
      if (!plain || /^[\[{]/.test(plain) || /^\s*"?prompt"?\s*:/.test(plain))
        throw new Error(
          "The text model returned incomplete prompt JSON. Completed prompts are saved; resume to continue.",
        );
      this.onPrompt(plain);
      this.emitted++;
    }
    this.onDraft("");
  }
}

/** Tamil Unicode block (Tamil script). */
const TAMIL_RE = /[\u0B80-\u0BFF]/;

export function hasTamilScript(text: string): boolean {
  return TAMIL_RE.test(text);
}

export function isMostlyTamil(text: string): boolean {
  const chars = [...text.replace(/\s/g, "")];
  if (chars.length === 0) return false;
  const tamilCount = chars.filter((c) => TAMIL_RE.test(c)).length;
  return tamilCount / chars.length > 0.5;
}

export type ScriptSegment = { text: string; tamil: boolean };

export function splitByTamilScript(text: string): ScriptSegment[] {
  if (!text) return [{ text: "", tamil: false }];

  const segments: ScriptSegment[] = [];
  let current = "";
  let currentTamil = TAMIL_RE.test(text[0] ?? "");

  for (const char of text) {
    const charTamil = TAMIL_RE.test(char);
    if (charTamil !== currentTamil && current.length > 0) {
      segments.push({ text: current, tamil: currentTamil });
      current = "";
      currentTamil = charTamil;
    }
    current += char;
    currentTamil = charTamil;
  }

  if (current.length > 0) {
    segments.push({ text: current, tamil: currentTamil });
  }

  return segments.length > 0 ? segments : [{ text, tamil: false }];
}

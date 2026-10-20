import { posix } from "node:path";

export interface Fingerprint { path: string; ext: string; tokens: string[]; ids: string[] }
export const SAME_PATH_JACCARD = 0.5;
export const SAME_EXTENSION_JACCARD = 0.7;
// Fixed vocabulary: changing this list changes persisted matching semantics.
const STOP_WORDS = new Set(("a an and are as at be been being but by can could did do does for from has have if in into is it "
  + "its may might of on or possible should than that the their then there these this to was were when which will with would").split(" "));

export function fingerprint(finding: { path: string; body: string }): Fingerprint {
  const path = posix.normalize(finding.path.replace(/\\/g, "/")).replace(/^\.\//, "");
  const identifiers = new Set<string>();
  const body = finding.body.replace(/(`+)([\s\S]*?)\1/g, (_span: string, _ticks: string, code: string) => {
    for (const part of code.split(/[^A-Za-z0-9_]+/)) {
      if (part.length >= 2) identifiers.add(part.toLowerCase());
    }
    return " ";
  }).toLowerCase();
  const tokens = [...new Set((body.match(/\p{L}+/gu) ?? []).filter(word => !STOP_WORDS.has(word)))].sort();
  return { path, ext: posix.extname(path).toLowerCase(), tokens, ids: [...identifiers].sort() };
}

export function similar(a: Fingerprint, b: Fingerprint): boolean {
  const ids = new Set(a.ids), sharedId = b.ids.some(id => ids.has(id));
  if (a.ids.length && b.ids.length && !sharedId) return false;
  const left = new Set(a.tokens), right = new Set(b.tokens);
  const intersection = [...left].filter(word => right.has(word)).length;
  const union = left.size + right.size - intersection;
  if (!union) return false;
  const jaccard = intersection / union;
  return (a.path === b.path && jaccard >= SAME_PATH_JACCARD)
    || (sharedId && !!a.ext && a.ext === b.ext && jaccard >= SAME_EXTENSION_JACCARD);
}

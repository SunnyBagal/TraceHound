/** Reviewed, general-purpose style signals. Each entry has positive and negative fixtures. */
export const nitPatterns: readonly { id: string; pattern: RegExp }[] = [
  { id: "naming", pattern: /\b(?:rename\s+(?:this|the|[\w`]+)\s+(?:to|for)|(?:variable|function|parameter|identifier)\s+nam(?:e|es|ing)\s+(?:should|could)|(?:use|prefer)\s+(?:camelCase|snake_case|PascalCase))\b/i },
  { id: "formatting", pattern: /\b(?:indentation|trailing whitespace|formatting|semicolon style|brace style)\b/i },
  { id: "typos", pattern: /\b(?:typo|misspell(?:ed|ing)?)\b/i },
  { id: "comments-docs", pattern: /\b(?:(?:add|update|improve|fix)\s+(?:a\s+|the\s+)?(?:comment|comments|documentation|docs|docstring)|(?:comment|documentation|docstring)\s+(?:should|could))\b/i },
  { id: "readability", pattern: /\b(?:readability|more readable|easier to read)\b/i },
  { id: "consider", pattern: /\bconsider\b/i },
  { id: "nit", pattern: /\bnit(?:pick)?\b/i },
  { id: "import-order", pattern: /\b(?:import order|(?:sort|reorder|alphabeti[sz]e)\s+(?:the\s+)?imports)\b/i },
  { id: "magic-numbers", pattern: /\bmagic numbers?\b/i },
  // Anchor this to an entire claim: a runtime failure mentioning an import is not style alone.
  { id: "unused-import", pattern: /^\s*(?:(?:please\s+)?remove\s+(?:the\s+)?unused import[^.!?\n]*|(?:the\s+)?import\s+[^.!?\n]+\s+is unused)[.!]?\s*$/i },
];

/** Reviewed runtime-defect vocabulary from general knowledge, independent of review datasets. */
export const defectSignals: readonly { id: string; pattern: RegExp }[] = [
  { id: "crash", pattern: /\bcrash(?:es|ed|ing)?\b/i },
  { id: "throw", pattern: /\bthrow(?:s|n|ing)?\b/i },
  { id: "exception", pattern: /\bexceptions?\b/i },
  { id: "type-error", pattern: /\bTypeError\b/i },
  { id: "null", pattern: /\bnull\b/i },
  { id: "undefined", pattern: /\bundefined\b/i },
  { id: "nan", pattern: /\bNaN\b/i },
  { id: "panic", pattern: /\bpanic(?:s|ked|king)?\b/i },
  { id: "fail", pattern: /\bfail(?:s|ed|ing|ure|ures)?\b/i },
  { id: "error", pattern: /\berrors?\b/i },
  { id: "wrong", pattern: /\bwrong\b/i },
  { id: "incorrect", pattern: /\bincorrect(?:ly)?\b/i },
  { id: "broken", pattern: /\b(?:broken|breaks?|breaking)\b/i },
  { id: "never", pattern: /\bnever\b/i },
  { id: "always", pattern: /\balways\b/i },
  { id: "leak", pattern: /\bleak(?:s|ed|ing)?\b/i },
  { id: "race", pattern: /\brace(?:s)?\b/i },
  { id: "overflow", pattern: /\boverflow(?:s|ed|ing)?\b/i },
  { id: "off-by-one", pattern: /\boff[-\s]by[-\s]one\b/i },
  { id: "injection", pattern: /\binjections?\b/i },
  { id: "xss", pattern: /\bXSS\b/i },
  { id: "unauthorized", pattern: /\bunauthori[sz]ed\b/i },
  { id: "bypass", pattern: /\bbypass(?:es|ed|ing)?\b/i },
  { id: "data-loss", pattern: /\bdata\s+loss\b/i },
  { id: "deadlock", pattern: /\bdeadlock(?:s|ed|ing)?\b/i },
  { id: "infinite-loop", pattern: /\binfinite\s+loops?\b/i },
  { id: "regression", pattern: /\bregressions?\b/i },
  { id: "unset", pattern: /\bis\s+never\s+set\b/i },
  { id: "returns-instead", pattern: /\breturns\b[\s\S]+?\binstead\s+of\b/i },
];

export function nitMatch(body: string): string | undefined {
  if (defectSignals.some(({ pattern }) => pattern.test(body))) return undefined;
  return nitPatterns.find(({ pattern }) => pattern.test(body))?.id;
}

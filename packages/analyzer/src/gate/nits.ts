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

export function nitMatch(body: string): string | undefined {
  return nitPatterns.find(({ pattern }) => pattern.test(body))?.id;
}

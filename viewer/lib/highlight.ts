import { useCallback, useMemo, useReducer } from "react";
import type { Snapshot } from "./types";

/** Lightweight code tokens rendered as React text, never HTML from a remote file. */
export function highlightCode(line: string): { text: string; kind: "plain" | "comment" | "string" | "keyword" | "number" }[] {
  const pattern = /(\/\/.*$|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(import|export|from|const|let|var|function|async|await|return|if|else|new|class|interface|type|throw|try|catch|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
  const tokens: ReturnType<typeof highlightCode> = [];
  let end = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > end) tokens.push({ text: line.slice(end, match.index), kind: "plain" });
    tokens.push({ text: match[0], kind: match[1] ? "comment" : match[2] ? "string" : match[3] ? "keyword" : "number" });
    end = match.index + match[0].length;
  }
  if (end < line.length) tokens.push({ text: line.slice(end), kind: "plain" });
  return tokens;
}

/**
 * What an inspector row points at on the canvas while it is hovered or keyboard-focused.
 * Transient: it never touches the URL or history, and it is styled apart from the selection.
 */
export interface Highlight {
  /** identifies the row, so a late leave/blur from another row can't clear this one */
  key: string;
  nodeIds: string[];
  edgeIds: string[];
}

/** Hover wins while the pointer is on a row; keyboard focus shows when it isn't. */
export interface HighlightState {
  hover: Highlight | null;
  focus: Highlight | null;
}

export type HighlightAction =
  | { type: "enter" | "focus"; target: Highlight }
  | { type: "leave" | "blur"; key: string }
  | { type: "clear" };

export const NO_HIGHLIGHT: HighlightState = { hover: null, focus: null };

export function highlightReducer(state: HighlightState, action: HighlightAction): HighlightState {
  switch (action.type) {
    case "enter":
      return { ...state, hover: action.target };
    case "focus":
      return { ...state, focus: action.target };
    case "leave":
      return state.hover?.key === action.key ? { ...state, hover: null } : state;
    case "blur":
      return state.focus?.key === action.key ? { ...state, focus: null } : state;
    case "clear":
      return state.hover || state.focus ? NO_HIGHLIGHT : state;
  }
}

export function activeHighlight(state: HighlightState): Highlight | null {
  return state.hover ?? state.focus;
}

/** Edges with at least one evidence item in `file` (Files tab rows). */
export function edgesWithEvidenceIn(snapshot: Snapshot, file: string): string[] {
  const inFile = new Set(snapshot.evidence.filter((e) => e.file === file).map((e) => e.id));
  return snapshot.edges.filter((e) => e.evidenceIds.some((id) => inFile.has(id))).map((e) => e.id);
}

export interface HighlightHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  "data-highlighted": boolean;
}
export type BindHighlight = (target: Highlight) => HighlightHandlers;

export const noHighlight: BindHighlight = () => ({ onMouseEnter() {}, onMouseLeave() {}, onFocus() {}, onBlur() {}, "data-highlighted": false });

export function useHighlight(): { active: Highlight | null; bind: BindHighlight; clear: () => void } {
  const [state, dispatch] = useReducer(highlightReducer, NO_HIGHLIGHT);
  const active = activeHighlight(state);
  const bind = useCallback<BindHighlight>(
    (target) => ({
      onMouseEnter: () => dispatch({ type: "enter", target }),
      onMouseLeave: () => dispatch({ type: "leave", key: target.key }),
      onFocus: () => dispatch({ type: "focus", target }),
      onBlur: () => dispatch({ type: "blur", key: target.key }),
      "data-highlighted": active?.key === target.key,
    }),
    [active?.key],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  return useMemo(() => ({ active, bind, clear }), [active, bind, clear]);
}

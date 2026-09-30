"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./types";

/**
 * Inspector navigation. The panel shows the last entry of a stack; every in-panel step pushes a
 * browser history entry (and ?component= / ?edge=), so the back button walks back through the
 * panel. The whole stack rides in history.state, so any history entry restores its breadcrumb.
 */
export type Tab = "overview" | "files" | "connections" | "evidence";
export type Entry = { type: "node" | "edge"; id: string; tab?: Tab };
export type Stack = Entry[];

const KEY = "tracehound";
const same = (a: Entry | undefined, b: Entry) => a?.type === b.type && a.id === b.id;

export const current = (stack: Stack): Entry | undefined => stack[stack.length - 1];
/** In-panel step: append, unless it's already the open item. */
export const push = (stack: Stack, entry: Entry): Stack => (same(current(stack), entry) ? stack : [...stack, entry]);
export const back = (stack: Stack): Stack => stack.slice(0, -1);
/** Crumb click: keep the path up to and including `index`. */
export const jump = (stack: Stack, index: number): Stack => stack.slice(0, Math.max(0, index) + 1);
export const withTab = (stack: Stack, tab: Tab): Stack => (stack.length ? [...back(stack), { ...current(stack)!, tab }] : stack);

export function exists(snapshot: Snapshot, entry: Entry): boolean {
  return entry.type === "node" ? snapshot.components.some((c) => c.id === entry.id) : snapshot.edges.some((e) => e.id === entry.id);
}

/** Deep link: ?component=<id> or ?edge=<id> opens the inspector with a one-item breadcrumb. */
export function entryFromSearch(search: string, snapshot: Snapshot): Entry | null {
  const params = new URLSearchParams(search);
  const component = params.get("component");
  const edge = params.get("edge");
  if (component && exists(snapshot, { type: "node", id: component })) return { type: "node", id: component };
  if (edge && exists(snapshot, { type: "edge", id: edge })) return { type: "edge", id: edge };
  return null;
}

/** The query string for `entry`, keeping every other parameter (e.g. ?impact=). */
export function searchFor(search: string, entry: Entry | undefined): string {
  const params = new URLSearchParams(search);
  params.delete("component");
  params.delete("edge");
  if (entry) params.set(entry.type === "node" ? "component" : "edge", entry.id);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A stack read back from history.state, keeping only entries this snapshot still has. */
export function stackFromState(state: unknown, snapshot: Snapshot): Stack | null {
  const raw = (state as { [KEY]?: { stack?: unknown } } | null)?.[KEY]?.stack;
  if (!Array.isArray(raw)) return null;
  return raw.filter((e): e is Entry => Boolean(e) && (e.type === "node" || e.type === "edge") && typeof e.id === "string" && exists(snapshot, e));
}

export interface PanelNavigation {
  stack: Stack;
  /** open from outside the panel (canvas, warnings, impact list): a new one-item breadcrumb */
  open: (entry: Entry | null) => void;
  /** step inside the panel: extends the breadcrumb */
  push: (entry: Entry) => void;
  back: () => void;
  jump: (index: number) => void;
  close: () => void;
  setTab: (tab: Tab) => void;
}

export function usePanelNavigation(snapshot: Snapshot): PanelNavigation {
  const [stack, setStack] = useState<Stack>(() => {
    if (typeof window === "undefined") return [];
    const entry = entryFromSearch(window.location.search, snapshot);
    return entry ? [entry] : [];
  });
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const commit = useCallback((next: Stack, mode: "push" | "replace") => {
    setStack(next);
    const url = `${window.location.pathname}${searchFor(window.location.search, current(next))}${window.location.hash}`;
    const state = { ...(window.history.state ?? {}), [KEY]: { stack: next } };
    if (mode === "push") window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
  }, []);

  useEffect(() => {
    // Record the initial (possibly deep-linked) stack on the entry we loaded into.
    commit(stackRef.current, "replace");
    const onPop = (event: PopStateEvent) => {
      const restored = stackFromState(event.state, snapshot);
      if (restored) return setStack(restored);
      const entry = entryFromSearch(window.location.search, snapshot);
      setStack(entry ? [entry] : []);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [snapshot, commit]);

  return {
    stack,
    open: useCallback(
      (entry) => {
        const s = stackRef.current;
        if (!entry) {
          if (s.length) commit([], "push");
        } else if (!(s.length === 1 && same(s[0], entry))) commit([entry], "push");
      },
      [commit],
    ),
    push: useCallback((entry) => {
      const s = stackRef.current;
      const next = push(s, entry);
      if (next !== s) commit(next, "push");
    }, [commit]),
    // Back and crumb jumps go through the browser history, so the panel and the back button
    // never disagree; popstate restores the stack stored on that entry.
    back: useCallback(() => {
      if (stackRef.current.length > 1) window.history.back();
    }, []),
    jump: useCallback((index) => {
      const steps = stackRef.current.length - 1 - index;
      if (steps > 0) window.history.go(-steps);
    }, []),
    close: useCallback(() => {
      if (stackRef.current.length) commit([], "push");
    }, [commit]),
    setTab: useCallback((tab) => commit(withTab(stackRef.current, tab), "replace"), [commit]),
  };
}

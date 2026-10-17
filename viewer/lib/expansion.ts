"use client";
import { useCallback, useEffect, useState } from "react";

export function expandedFromHash(hash: string, valid: ReadonlySet<string>): Set<string> {
  return new Set(new URLSearchParams(hash.replace(/^#/, "")).getAll("expanded").filter((id) => valid.has(id)));
}
export function expansionHash(hash: string, expanded: ReadonlySet<string>): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  params.delete("expanded");
  [...expanded].sort().forEach((id) => params.append("expanded", id));
  return params.size ? `#${params}` : "";
}
export function useExpandedNodes(valid: ReadonlySet<string>) {
  const [expanded, setExpanded] = useState(() => expandedFromHash(typeof window === "undefined" ? "" : window.location.hash, valid));
  useEffect(() => {
    const restore = () => setExpanded(expandedFromHash(window.location.hash, valid));
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("hashchange", restore); window.removeEventListener("popstate", restore); };
  }, [valid]);
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${expansionHash(window.location.hash, next)}`);
      return next;
    });
  }, []);
  return { expanded, toggle };
}

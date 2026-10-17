"use client";
import { useEffect, useRef, useState } from "react";
import { declarationRange, fetchSource, sourceWindow } from "@/lib/source";
import type { Evidence, Snapshot } from "@/lib/types";
import { CodeSnippet } from "./CodeSnippet";

export function SourcePreview({ snapshot, file, evidence }: { snapshot: Snapshot; file: string; evidence?: Evidence }) {
  const [snippet, setSnippet] = useState(evidence?.snippet);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const more = async () => {
    setStatus("loading");
    try {
      const source = await fetchSource(snapshot.repo, file);
      if (!mounted.current) return;
      setSnippet(sourceWindow(source, evidence, declarationRange(snapshot, file, evidence)));
      setStatus("loaded");
    } catch {
      if (mounted.current) setStatus("failed");
    }
  };
  return <div className="mt-3 space-y-3" data-testid="source-preview">
    {snippet?.lines.length ? <CodeSnippet evidence={{ id: "preview", file, extractor: "symbols", confidence: 1, detail: "Snapshot source", ...evidence, range: evidence?.range ?? { startLine: snippet.startLine, endLine: snippet.startLine }, snippet }} /> : <p className="text-sm leading-relaxed text-muted">No evidence snippet recorded for this file.</p>}
    {status === "idle" && <button type="button" onClick={() => void more()} className="text-sm text-accent hover:underline">Show more</button>}
    {status === "loading" && <p role="status" className="text-sm text-muted">Loading source…</p>}
    {status === "failed" && <p role="status" className="text-sm leading-relaxed text-muted">Source couldn’t be loaded. The snapshot snippet is still shown.</p>}
    {status === "loaded" && snippet && <p className="text-sm text-muted">Lines {snippet.startLine}–{snippet.startLine + snippet.lines.length - 1} at {snapshot.repo.commitSha.slice(0, 7)}</p>}
  </div>;
}

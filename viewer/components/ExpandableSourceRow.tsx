"use client";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { permalink } from "@/lib/github";
import { METHOD_COLORS } from "@/lib/contents";
import type { Evidence, Snapshot } from "@/lib/types";
import { SourcePreview } from "./SourcePreview";

export function ExpandableSourceRow({ snapshot, file, label, method, evidence, reason }: { snapshot: Snapshot; file: string; label: string; method?: string; evidence?: Evidence; reason?: string }) {
  const [open, setOpen] = useState(false);
  const href = permalink(snapshot.repo, file, evidence?.range.startLine, evidence?.range.endLine);
  return <div>
    <div className="flex items-start gap-2">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${method ? `${method} ` : ""}${label}`} className="flex min-w-0 flex-1 items-start gap-2 py-1 text-left font-mono text-sm leading-relaxed text-text hover:text-accent">
        {open ? <ChevronDown className="mt-1 size-4 shrink-0" /> : <ChevronRight className="mt-1 size-4 shrink-0" />}
        {method && <span className="shrink-0 rounded bg-bg px-1.5 font-semibold" style={{ color: METHOD_COLORS[method] }}>{method}</span>}
        <span className="break-all">{label}</span>
      </button>
      {href && <a href={href} target="_blank" rel="noreferrer" className="shrink-0 rounded p-2 text-muted hover:text-accent" aria-label={`GitHub permalink for ${method ? `${method} ` : ""}${label}`} title={`Open ${file} on GitHub`}><ExternalLink className="size-4" /></a>}
    </div>
    {reason && <p className="ml-6 text-sm leading-relaxed text-muted">{reason}</p>}
    {open && <SourcePreview key={`${snapshot.repo.commitSha}:${file}:${evidence?.id}`} snapshot={snapshot} file={file} evidence={evidence} />}
  </div>;
}

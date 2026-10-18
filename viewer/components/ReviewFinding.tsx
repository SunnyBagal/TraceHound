import { ArrowUpRight, Code2, FileCode2 } from "lucide-react";
import { MODEL_DISCLOSURE, pullHref, type Finding } from "@/lib/reviews";
import { CodeBlock } from "./CodeSnippet";

function CommentText({ body }: { body: string }) {
  return <div className="max-w-[80ch] whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text">{body.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part.startsWith("`") ? <code key={i} className="rounded bg-bg px-1 font-mono text-sm">{part.slice(1, -1)}</code> : part)}</div>;
}

export function FixDiff({ finding }: { finding: Finding }) {
  if (finding.suggestion === undefined) return <p className="text-sm leading-relaxed text-muted">No suggestion was posted for this finding.</p>;
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2" aria-label="Suggested fix diff" data-testid="fix-diff">
    <section className="min-w-0" aria-label="Original code">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted"><span className="text-diff-removed" aria-hidden>−</span> Before</h3>
      {finding.original !== undefined ? <CodeBlock lines={finding.original.split("\n")} startLine={finding.startLine ?? finding.line ?? 1} marker="-" wrap /> : <p className="rounded-lg border border-line bg-bg p-4 text-sm leading-relaxed text-muted">Original code is unavailable in this review’s diff context. Open the comment on GitHub.</p>}
    </section>
    <section className="min-w-0" aria-label="Suggested replacement">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted"><span className="text-diff-added" aria-hidden>+</span> After · suggestion</h3>
      {finding.suggestion === "" ? <div className="rounded-lg border border-line bg-bg p-4 text-sm leading-relaxed text-diff-added">Delete the selected lines.</div> : <CodeBlock lines={finding.suggestion.split("\n")} startLine={finding.startLine ?? finding.line ?? 1} marker="+" wrap />}
    </section>
  </div>;
}

export function ReviewFinding({ finding, repo, number, reviewId }: { finding: Finding; repo: string; number: number; reviewId: number }) {
  const comment = pullHref(repo, number, finding.commentId ? `#discussion_r${finding.commentId}` : `#pullrequestreview-${reviewId}`);
  const files = pullHref(repo, number, finding.commentId ? `/files#r${finding.commentId}` : "/files");
  const hasFix = finding.suggestion !== undefined;
  return <article id={`finding-${finding.id}`} aria-label={`Finding in ${finding.path}`} className="rounded-2xl border border-panel-line bg-panel p-5 sm:p-7" data-testid="review-finding">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <a href={comment} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-2 text-sm font-medium text-text hover:text-accent"><FileCode2 className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /><span className="break-all font-mono">{finding.path}{finding.line !== null ? `:${finding.line}` : ""}</span><ArrowUpRight className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden /></a>
        <p className="mt-2 text-sm leading-relaxed text-muted">{MODEL_DISCLOSURE}{finding.outdated ? " · earlier version of this code" : ""}</p>
      </div>
      <span className="shrink-0 rounded-md border border-line-strong px-2.5 py-1 text-sm text-muted">{finding.source ? <>Source: <span className="font-mono text-text">{finding.source}</span></> : "Source not recorded"}</span>
    </header>
    <div className="my-6"><CommentText body={finding.body} /></div>
    <FixDiff finding={finding} />
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-panel-line pt-5">
      <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{hasFix ? "Review and commit the suggestion in GitHub’s Files tab." : "Read the full discussion on GitHub."}</p>
      <a href={hasFix ? files : comment} target="_blank" rel="noreferrer" className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${hasFix ? "border-accent/60 bg-accent-soft text-accent hover:bg-accent/20" : "border-line-strong text-text hover:bg-card-hover"}`}>
        <Code2 className="size-4" aria-hidden />{hasFix ? "Commit fix on GitHub" : "Open finding on GitHub"}<ArrowUpRight className="size-4" aria-hidden />
      </a>
    </footer>
  </article>;
}

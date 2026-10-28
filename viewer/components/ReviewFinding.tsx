import { ArrowUpRight, Code2, FileCode2 } from "lucide-react";
import { findingParts } from "@/lib/pulls";
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

export function ReviewFinding({ finding, repo, number, reviewId, index }: { finding: Finding; repo: string; number: number; reviewId: number; index?: number }) {
  const comment = pullHref(repo, number, finding.commentId ? `#discussion_r${finding.commentId}` : `#pullrequestreview-${reviewId}`);
  const files = pullHref(repo, number, finding.commentId ? `/files#r${finding.commentId}` : "/files");
  const hasFix = finding.suggestion !== undefined;
  const { title, more } = findingParts(finding.body);
  return <article id={`finding-${finding.id}`} aria-label={`Finding in ${finding.path}`} className="review-card rv-card" data-testid="review-finding">
    <header className="rv-card-head">
      {index !== undefined && <span className="rv-card-n" aria-hidden>{String(index).padStart(2, "0")}</span>}
      <div className="min-w-0 flex-1">
        {/* effect first (R15): the sentence that says what breaks, verbatim from the comment */}
        <h3 className="rv-card-title" data-testid="finding-title">{title}</h3>
        <div className="rv-card-tags">
          <a href={comment} target="_blank" rel="noreferrer" className="rv-loc"><FileCode2 className="size-3.5 shrink-0" aria-hidden /><span className="break-all">{finding.path}{finding.line !== null ? `:${finding.line}` : ""}</span><ArrowUpRight className="size-3.5 shrink-0 opacity-60" aria-hidden /></a>
          <span className="rv-disclosure">{MODEL_DISCLOSURE}</span>
          {finding.outdated && <span className="rv-tag">earlier version of this code</span>}
          <span className="rv-tag">{finding.source ? <>Source: <span className="font-mono text-text">{finding.source}</span></> : "Source not recorded"}</span>
        </div>
      </div>
    </header>
    {/* a one-sentence comment is its title; otherwise the whole comment follows */}
    {more ? <div className="rv-card-body"><CommentText body={finding.body} /></div> : <div className="h-5" />}
    <FixDiff finding={finding} />
    <footer className="rv-card-foot">
      <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{hasFix ? "Review and commit the suggestion in GitHub’s Files tab." : "Read the full discussion on GitHub."}</p>
      <a href={hasFix ? files : comment} target="_blank" rel="noreferrer" className={`rv-action ${hasFix ? "rv-action-fix" : ""}`}>
        <Code2 className="size-4" aria-hidden />{hasFix ? "Commit fix on GitHub" : "Open finding on GitHub"}<ArrowUpRight className="size-4" aria-hidden />
      </a>
    </footer>
  </article>;
}

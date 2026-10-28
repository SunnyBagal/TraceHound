import { Check } from "lucide-react";
import { FINDER_RULE } from "@/lib/landing";
import { PipelineTrack } from "./PipelineTrack";

/**
 * Find → reproduce → repair → verify, as rows on a rail that draws itself as the page scrolls
 * (PipelineTrack; no other motion): each stage says who
 * does the work and shows the one artefact it hands on. Sources: the finder's rule
 * (packages/analyzer/src/finder/rules.ts, via lib/landing.ts), the reproduce stage's four checks
 * (decision 048), the Docker sandbox's settings (decision 036, docker-provider@2) and the harness's
 * three gates (decisions 026, 043).
 */

const REPRO_CHECKS = [
  "exactly one new test file, and nothing else",
  "it fails on an AssertionError, with no new tsc error",
  "the same cases fail on a second run",
  "the per-test rule holds with the file in the suite",
] as const;

const SANDBOX = [
  ["image", "tracehound-sandbox:bun1.4.2-ts5.9.3-2"],
  ["user", "uid 1000, not root"],
  ["capabilities", "dropped"],
  ["limits", "2 GB · 2 CPUs · 512 pids"],
  ["network", "disconnected after setup"],
  ["mounts", "none, no Docker socket"],
] as const;

const VERIFY = ["reproduction test", "existing tests", "typecheck"] as const;

function Stage({ id, tone, who, title, text, children }: { id: string; tone: string; who: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <article className="pl-cell" data-tone={tone} data-stage={id} data-testid="pipeline-stage">
      <span className="pl-node" aria-hidden />
      <div className="pl-copy">
        <p className="pl-kicker">
          {id}
          <span className="pl-who">{who}</span>
        </p>
        <h4 className="pl-title">{title}</h4>
        <p className="pl-text">{text}</p>
      </div>
      <div className="pl-art">{children}</div>
    </article>
  );
}

export function Pipeline() {
  const [before, after] = FINDER_RULE.question.split("<METHOD> <path>");
  return (
    <PipelineTrack>
      <Stage id="find" tone="amber" who="no model" title="A rule asks one narrow question" text="A rule over the graph reads the code at its evidence and emits a hypothesis that a single test can settle.">
        <div className="pl-card">
          <p className="pl-card-head">
            <span className="pl-chip">{FINDER_RULE.id}</span>
            <span className="text-faint">finder-rules@1</span>
          </p>
          <p className="pl-question">
            {before}
            <code>&lt;METHOD&gt; &lt;path&gt;</code>
            {after}
          </p>
        </div>
      </Stage>
      <Stage id="reproduce" tone="violet" who="Nemotron" title="One test has to fail first" text="Nemotron writes one test for the claim. A fresh sandbox, independent of the agent, checks it.">
        <div className="pl-card">
          <p className="pl-card-head">
            <span className="text-text">repro-v1</span>
            <span className="pl-state" data-tone="violet">REPRODUCED</span>
          </p>
          <ul className="pl-checks">
            {REPRO_CHECKS.map((c) => (
              <li key={c}>
                <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </Stage>
      <Stage id="repair" tone="glacier" who="Nemotron" title="The fix is made in a sealed box" text="Nemotron edits the repo in a local Docker sandbox; the network is off before the agent starts.">
        <div className="pl-card pl-card-art fx-art" data-tone="glacier">
          <span className="fx-beams" aria-hidden />
          <dl className="pl-spec">
            {SANDBOX.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Stage>
      <Stage id="verify" tone="green" who="no model" title="The harness, not the agent, says done" text="The patch counts only when the reproduction test passes, the repo's own tests still pass and the typecheck adds no new error.">
        <div className="pl-card">
          <ul className="pl-checks pl-checks-big">
            {VERIFY.map((c) => (
              <li key={c} data-testid="verify-check">
                <span aria-hidden>✓</span>
                {c}
              </li>
            ))}
          </ul>
          <p className="pl-resolved" data-testid="test-passes">
            RESOLVED
          </p>
        </div>
      </Stage>
    </PipelineTrack>
  );
}

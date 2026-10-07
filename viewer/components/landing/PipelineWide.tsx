import { Container, FlaskConical, Search, ShieldCheck, WifiOff, Wrench, type LucideIcon } from "lucide-react";
import { FINDER_RULE } from "@/lib/landing";
import { wrap } from "./Pipeline";

/**
 * Find → reproduce → repair → verify, wide (lg and up): four columns joined by a track that draws
 * from stage to stage. A rule emits a hypothesis; the reproduce stage writes one test, which fails
 * on an assertion in two runs (REPRODUCED); the repair agent writes a patch in a sandbox with the
 * network off; the harness checks the patch in a Docker sandbox with the network off: the
 * reproduction test, the existing tests and the typecheck (RESOLVED).
 */

const SPEED = 0.85;
const at = (t: number, d?: number) => ({ "--t": `${Math.round(t * SPEED)}ms`, ...(d ? { "--d": `${Math.round(d * SPEED)}ms` } : {}) }) as React.CSSProperties;
const fill = (name: string) => ({ fill: `var(--${name})` });

const COL = 245;
const COL_X = [0, 275, 550, 825];
const TRACK_Y = 46;

const STAGES: { name: string; model: string; icon: LucideIcon; t: number }[] = [
  { name: "find", model: "no model", icon: Search, t: 0 },
  { name: "reproduce", model: "Nemotron", icon: FlaskConical, t: 1600 },
  { name: "repair", model: "Nemotron", icon: Wrench, t: 3800 },
  { name: "verify", model: "no model", icon: ShieldCheck, t: 5300 },
];

function Chip({ x, y, w, label, color, text = color, t, testId, filled = false }: { x: number; y: number; w: number; label: string; color: string; text?: string; t: number; testId?: string; filled?: boolean }) {
  return (
    <g data-anim="in" style={at(t, 350)} data-testid={testId}>
      <rect x={x} y={y} width={w} height={24} rx={12} strokeWidth={1.25} style={{ fill: filled ? `var(--${color})` : "var(--panel-raised)", stroke: `var(--${color})` }} />
      <text x={x + w / 2} y={y + 16} textAnchor="middle" className="mono" fontSize={11.5} fontWeight={filled ? 700 : 400} style={fill(filled ? "page" : text)}>
        {label}
      </text>
    </g>
  );
}

export function PipelineWide() {
  const question = wrap(FINDER_RULE.question, 33);
  const [find, repro, repair, verify] = COL_X as [number, number, number, number];
  return (
    <svg viewBox="0 0 1070 300" className="block h-auto w-full" aria-hidden data-testid="pipeline-wide">
      {/* the track and the stages */}
      {STAGES.slice(1).map((s, i) => (
        <path key={s.name} className="lp-path" data-anim="draw" style={{ ...at(s.t - 350, 350), fill: "none", stroke: "var(--line-strong)" }} pathLength={1} strokeWidth={1.5} d={`M${COL_X[i]! + 14} ${TRACK_Y} H${COL_X[i + 1]! + 6}`} />
      ))}
      {STAGES.map((s, i) => {
        const x = COL_X[i]!;
        return (
          <g key={s.name} data-anim="in" style={at(s.t, 350)} data-testid="pipeline-stage">
            <g style={{ color: "var(--accent)" }}>
              <s.icon x={x} y={6} width={18} height={18} strokeWidth={2} />
            </g>
            <text x={x + 26} y={21} className="mono" fontSize={15} fontWeight={700} style={fill("text")}>
              {s.name}
            </text>
            <text x={x + COL} y={21} textAnchor="end" className="mono" fontSize={11.5} style={fill("faint")}>
              {s.model}
            </text>
            <circle cx={x + 9} cy={TRACK_Y} r={5} style={fill("accent")} />
          </g>
        );
      })}

      {/* find: a rule emits a hypothesis */}
      <Chip x={find} y={66} w={210} label={`rule ${FINDER_RULE.id}`} color="line-strong" text="text" t={200} />
      <path className="lp-path" data-anim="draw" style={{ ...at(500, 200), fill: "none", stroke: "var(--line-strong)" }} pathLength={1} strokeWidth={1.25} d="M20 90 V104" />
      <g data-anim="in" style={at(600, 350)} data-testid="hypothesis">
        <rect x={find} y={104} width={COL} height={30 + question.length * 17} rx={10} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--highlight)" }} />
        <text x={find + 12} y={122} className="mono" fontSize={10.5} style={fill("highlight")}>
          hypothesis · one question
        </text>
      </g>
      {question.map((line, i) => (
        <text key={i} x={find + 12} y={142 + i * 17} fontSize={13} data-anim="in" style={{ ...at(750 + i * 90, 300), ...fill("text") }}>
          {line}
        </text>
      ))}

      {/* reproduce: one test, failing the same way twice */}
      <g data-anim="in" style={at(1750, 350)}>
        <rect x={repro} y={66} width={COL} height={118} rx={10} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
        <text x={repro + 12} y={86} className="mono" fontSize={11} style={fill("faint")}>
          + 1 new test file
        </text>
      </g>
      {[150, 196, 120, 210, 170, 90].map((w, i) => (
        <rect key={i} x={repro + 12 + (i % 3 === 1 ? 14 : 0)} y={100 + i * 12} width={w} height={5} rx={2.5} data-anim="grow" style={{ ...at(1900 + i * 120, 300), fill: "var(--muted)" }} opacity={0.55} />
      ))}
      <Chip x={repro} y={194} w={COL} label="run 1  ✗ AssertionError" color="diff-removed" t={2800} />
      <Chip x={repro} y={224} w={COL} label="run 2  ✗ same cases" color="diff-removed" t={3050} testId="test-fails" />
      <Chip x={repro} y={262} w={130} label="REPRODUCED" color="diff-removed" t={3350} filled />

      {/* repair: a patch, in a sandbox with the network off */}
      <g data-anim="in" style={at(3950, 350)}>
        <rect x={repair} y={66} width={COL} height={118} rx={10} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
        <text x={repair + 12} y={86} className="mono" fontSize={11} style={fill("faint")}>
          patch
        </text>
      </g>
      {[
        { sign: "−", color: "diff-removed", w: 150 },
        { sign: "−", color: "diff-removed", w: 96 },
        { sign: "+", color: "diff-added", w: 176 },
        { sign: "+", color: "diff-added", w: 130 },
        { sign: "+", color: "diff-added", w: 160 },
      ].map((l, i) => (
        <g key={i}>
          <text x={repair + 14} y={110 + i * 15} className="mono" fontSize={12} fontWeight={700} data-anim="fade" style={{ ...at(4100 + i * 150, 200), ...fill(l.color) }}>
            {l.sign}
          </text>
          <rect x={repair + 30} y={103 + i * 15} width={l.w} height={5} rx={2.5} data-anim="grow" style={{ ...at(4100 + i * 150, 300), fill: `var(--${l.color})` }} opacity={0.75} />
        </g>
      ))}
      <g data-anim="in" style={{ ...at(4850, 350), color: "var(--muted)" }}>
        <rect x={repair} y={194} width={150} height={24} rx={12} strokeWidth={1} style={{ fill: "var(--panel-raised)", stroke: "var(--line-strong)" }} />
        <WifiOff x={repair + 12} y={199} width={14} height={14} strokeWidth={2} />
        <text x={repair + 34} y={210} className="mono" fontSize={11.5} style={fill("muted")}>
          network off
        </text>
      </g>

      {/* verify: the harness, not the agent, checks the patch */}
      <path
        className="lp-path"
        data-anim="draw"
        style={{ ...at(5450, 600), fill: "none", stroke: "var(--line-strong)" }}
        pathLength={1}
        strokeWidth={1.25}
        strokeDasharray="1"
        d={`M${verify + 10} 66 H${verify + COL - 10} Q${verify + COL} 66 ${verify + COL} 76 V242 Q${verify + COL} 252 ${verify + COL - 10} 252 H${verify + 10} Q${verify} 252 ${verify} 242 V76 Q${verify} 66 ${verify + 10} 66 Z`}
      />
      <g data-anim="in" style={{ ...at(5700, 350), color: "var(--muted)" }}>
        <Container x={verify + 12} y={76} width={15} height={15} strokeWidth={2} />
        <text x={verify + 34} y={88} className="mono" fontSize={11.5} style={fill("muted")}>
          Docker sandbox
        </text>
        <WifiOff x={verify + COL - 112} y={76} width={14} height={14} strokeWidth={2} />
        <text x={verify + COL - 92} y={88} className="mono" fontSize={11.5} style={fill("muted")}>
          network off
        </text>
      </g>
      {["reproduction test", "existing tests", "typecheck"].map((label, i) => (
        <g key={label} data-anim="in" style={at(5950 + i * 250, 300)} data-testid="verify-check">
          <text x={verify + 16} y={124 + i * 30} className="mono" fontSize={13} fontWeight={700} style={fill("diff-added")}>
            ✓
          </text>
          <text x={verify + 36} y={124 + i * 30} className="mono" fontSize={13} style={fill("text")}>
            {label}
          </text>
        </g>
      ))}
      <Chip x={verify + 12} y={212} w={120} label="RESOLVED" color="diff-added" t={6750} filled testId="test-passes" />
    </svg>
  );
}

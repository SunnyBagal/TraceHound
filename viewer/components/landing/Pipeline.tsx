import { FINDER_RULE } from "@/lib/landing";

/**
 * The findings pipeline, one stage at a time: a finder rule emits a hypothesis (a question), the
 * reproduce stage writes one test that fails on an assertion, the repair agent writes a patch, and
 * the harness runs the test again in a Docker sandbox with the network off, where it passes.
 */

const SPEED = 0.85;
const at = (t: number, d?: number) => ({ "--t": `${Math.round(t * SPEED)}ms`, ...(d ? { "--d": `${Math.round(d * SPEED)}ms` } : {}) }) as React.CSSProperties;

/** Wrap the rule's question at word boundaries, at most `width` characters a line. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return [...lines, line];
}

const STAGES = [
  { name: "find", model: "no model", y: 16, t: 0 },
  { name: "reproduce", model: "Nemotron", y: 160, t: 1900 },
  { name: "repair", model: "Nemotron", y: 288, t: 3800 },
  { name: "verify", model: "no model", y: 370, t: 5150 },
] as const;

const text = (fill: string) => ({ fill: `var(--${fill})` });

export function Pipeline() {
  const question = wrap(FINDER_RULE.question, 44);
  return (
    <svg viewBox="0 0 360 424" className="block h-auto w-full" aria-hidden data-testid="pipeline">
      {/* the stages and the line that joins them */}
      {STAGES.slice(1).map((s, i) => (
        <path key={s.name} className="lp-path" data-anim="draw" style={{ ...at(s.t - 400, 400), fill: "none", stroke: "var(--line-strong)" }} pathLength={1} strokeWidth={1.5} d={`M14 ${STAGES[i]!.y + 7} V${s.y - 7}`} />
      ))}
      {STAGES.map((s) => (
        <g key={s.name} data-anim="in" style={at(s.t, 350)} data-testid="pipeline-stage">
          <circle cx={14} cy={s.y} r={5} style={{ fill: "var(--accent)" }} />
          <text x={28} y={s.y + 4.5} className="mono" fontSize={12.5} fontWeight={700} style={text("text")}>
            {s.name}
          </text>
          <text x={352} y={s.y + 4} textAnchor="end" className="mono" fontSize={11} style={text("faint")}>
            {s.model}
          </text>
        </g>
      ))}

      {/* find: a rule emits a hypothesis */}
      <g data-anim="in" style={at(200, 350)}>
        <rect x={28} y={30} width={186} height={22} rx={11} strokeWidth={1.25} style={{ fill: "var(--panel-raised)", stroke: "var(--line-strong)" }} />
        <text x={40} y={45} className="mono" fontSize={11}>
          <tspan style={text("faint")}>rule</tspan>
          <tspan dx={6} style={text("text")}>
            {FINDER_RULE.id}
          </tspan>
        </text>
      </g>
      <path className="lp-path" data-anim="draw" style={{ ...at(600, 200), fill: "none", stroke: "var(--line-strong)" }} pathLength={1} strokeWidth={1.25} d="M44 52 V62" />
      <g data-anim="in" style={at(750, 350)} data-testid="hypothesis">
        <rect x={28} y={62} width={324} height={18 + question.length * 15 + 8} rx={8} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--highlight)" }} />
        <text x={40} y={77} className="mono" fontSize={10.5} style={text("highlight")}>
          hypothesis
        </text>
      </g>
      {question.map((line, i) => (
        <text key={i} x={40} y={94 + i * 15} fontSize={12.5} data-anim="in" style={{ ...at(900 + i * 110, 300), ...text("text") }}>
          {line}
        </text>
      ))}

      {/* reproduce: one test, written, failing */}
      <g data-anim="in" style={at(2050, 350)}>
        <rect x={28} y={174} width={324} height={58} rx={8} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
        <text x={40} y={190} className="mono" fontSize={11} style={text("faint")}>
          + 1 new test file
        </text>
      </g>
      {[180, 250, 140].map((w, i) => (
        <rect key={i} x={40 + (i === 1 ? 14 : 0)} y={200 + i * 10} width={w} height={4} rx={2} data-anim="grow" style={{ ...at(2250 + i * 200, 350), fill: "var(--muted)" }} opacity={0.6} />
      ))}
      <g data-anim="in" style={at(3050, 350)} data-testid="test-fails">
        <rect x={28} y={240} width={236} height={22} rx={11} strokeWidth={1.25} style={{ fill: "none", stroke: "var(--diff-removed)" }} />
        <text x={40} y={255} className="mono" fontSize={11} style={text("diff-removed")}>
          ✗ fails on an assertion, twice
        </text>
      </g>

      {/* repair: a patch */}
      <g data-anim="in" style={at(3950, 350)}>
        <rect x={28} y={302} width={324} height={48} rx={8} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--line-strong)" }} />
        <text x={40} y={321} className="mono" fontSize={12} fontWeight={700} style={text("diff-removed")}>
          −
        </text>
        <text x={40} y={340} className="mono" fontSize={12} fontWeight={700} style={text("diff-added")}>
          +
        </text>
      </g>
      <rect x={56} y={315} width={170} height={4} rx={2} data-anim="grow" style={{ ...at(4150, 350), fill: "var(--diff-removed)" }} opacity={0.75} />
      <rect x={56} y={334} width={214} height={4} rx={2} data-anim="grow" style={{ ...at(4400, 350), fill: "var(--diff-added)" }} opacity={0.75} />

      {/* verify: the same test passes in the sandbox, network off */}
      <g data-anim="in" style={at(5300, 350)} data-testid="test-passes">
        <rect x={28} y={384} width={324} height={32} rx={8} strokeWidth={1.25} style={{ fill: "var(--card)", stroke: "var(--diff-added)" }} />
        <text x={40} y={404} className="mono" fontSize={11.5} fontWeight={700} style={text("diff-added")}>
          ✓ test passes
        </text>
      </g>
      {[
        { label: "Docker sandbox", x: 150, w: 100 },
        { label: "network off", x: 258, w: 86 },
      ].map((chip, i) => (
        <g key={chip.label} data-anim="in" style={at(5550 + i * 150, 300)}>
          <rect x={chip.x} y={390} width={chip.w} height={20} rx={10} strokeWidth={1} style={{ fill: "var(--panel-raised)", stroke: "var(--line-strong)" }} />
          <text x={chip.x + chip.w / 2} y={404} textAnchor="middle" className="mono" fontSize={10.5} style={text("muted")}>
            {chip.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/components/Logo";
import { useInView } from "./AnimatedFigure";

/** One run of text in a terminal line: its tone, then the text. */
export type Seg = readonly [tone: "text" | "dim" | "ok" | "hi" | "path" | "bad", text: string];
export type TermLine = readonly Seg[];
export interface Scenario {
  label: string;
  /** "$" for a command, "#" for a note about where the lines come from */
  prompt: "$" | "#";
  command: string;
  lines: readonly TermLine[];
}

const CHAR_MS = 24;
const LINE_MS = 110;

/**
 * A terminal card (viteplus-style): once it scrolls into view the command types itself and the
 * output appears line by line; the pills under it switch scenarios and replay. Every line is in the
 * DOM from the start (screen readers and the no-JS page read all of it); playback only fades lines
 * in, so the card never changes height. Reduced motion shows the finished frame.
 */
export function Terminal({ scenarios, name }: { scenarios: readonly Scenario[]; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"done" | "armed" | "play">("done");
  const [typed, setTyped] = useState(Infinity);
  const [shown, setShown] = useState(Infinity);
  const s = scenarios[active]!;

  // arm on mount (hide the output until it plays), unless motion is reduced
  useEffect(() => {
    if (!prefersReducedMotion()) {
      setMode("armed");
      setTyped(0);
      setShown(0);
    }
  }, []);
  useInView(ref, () => setMode((m) => (m === "armed" ? "play" : m)), 0.45);

  useEffect(() => {
    if (mode !== "play") return;
    setTyped(0);
    setShown(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = 280;
    for (let i = 1; i <= s.command.length; i++) timers.push(setTimeout(() => setTyped(i), start + i * CHAR_MS));
    const out = start + s.command.length * CHAR_MS + 360;
    s.lines.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), out + i * LINE_MS)));
    timers.push(setTimeout(() => setMode("done"), out + s.lines.length * LINE_MS));
    return () => timers.forEach(clearTimeout);
  }, [mode, s]);

  const rows = Math.max(...scenarios.map((x) => x.lines.length)) + 2;
  const typing = mode === "play" && typed < s.command.length;
  return (
    <div className="term-wrap" ref={ref}>
      <div className="term" style={{ "--rows": rows } as React.CSSProperties} data-testid={`terminal-${name}`} data-mode={mode}>
        <p className="term-cmd">
          <span className="term-prompt" aria-hidden>{s.prompt}</span>{" "}
          <span>{s.command.slice(0, typed)}</span>
          <span className="term-ghost">{s.command.slice(typed)}</span>
          {(typing || (mode === "play" && shown === 0)) && <span className="term-caret" aria-hidden />}
        </p>
        {s.lines.map((line, i) => (
          <p key={`${active}-${i}`} className="term-line" data-on={i < shown || undefined}>
            {line.length === 0 ? " " : line.map(([tone, text], j) => <span key={j} className={`t-${tone}`}>{text}</span>)}
          </p>
        ))}
      </div>
      {scenarios.length > 1 && (
        <div className="term-pills" role="group" aria-label="Scenario">
          {scenarios.map((x, i) => (
            <button
              key={x.label}
              type="button"
              aria-pressed={i === active}
              onClick={() => {
                setActive(i);
                if (!prefersReducedMotion()) setMode("play");
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

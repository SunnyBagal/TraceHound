import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraphPage from "@/app/graph/page";
import Home from "@/app/page";
import {
  ADDED_EDGE,
  CHANGE_COMPONENTS,
  COMMIT,
  COMMIT_FILES,
  DECLARATIONS,
  FINDER_RULE,
  GRAPH_COMPONENTS,
  GRAPH_EDGES,
  GRAPH_FILES,
  GRAPH_PATH_PREFIX,
  GRAPH_TREE,
  HELDOUT,
  IGNORED_BY_CONFIG,
  MODELS,
  RECALL,
  RECALL_COMPONENTS,
} from "@/lib/landing";
import { LEGACY_REDIRECT_SCRIPT } from "@/lib/legacy";

const ROOT = path.resolve(import.meta.dirname, "../..");
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
const text = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

interface ChangeSetJson {
  stats: { declarations: { added: number; modified: number }; edges: { added: number } };
  files: { linesAdded: number; linesRemoved: number }[];
  declarations: { name: string; file: string; status: string; componentId: string; modifications: string[] }[];
  edges: { kind: string; status: string; from: string; to: string; evidence: { side: string; file: string; line: number }[] }[];
  components: { id: string; name: string }[];
}
const changeSet: ChangeSetJson = json(`changesets/${COMMIT.changeSet}.json`);

const RECALL_SNAPSHOT = "snapshots/5d2165aa9654f17a148f6663bc478a3fd9f7fc6b/0.10.0.json";

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe('the landing page at "/"', () => {
  it("renders the landing page: nav, hero, the sections and the footer, and no viewer", () => {
    render(<Home />);
    expect(screen.getByTestId("landing")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Understand your code. Fix what breaks.");
    expect(screen.getByTestId("hero-line").textContent).toBe("AI agents that review and test pull requests with full context of the codebase.");
    for (const name of ["Understand what agents write.", "How it works", "Agents", "Roadmap"]) expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["TraceHound", "How it works", "Agents", "Roadmap", "GitHub"]);
    expect(within(nav).getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe("https://github.com/SunnyBagal/TraceHound");
    expect(within(nav).queryByText(/sign in|log in/i)).toBeNull();
    for (const id of ["how-it-works", "agents", "roadmap"]) expect(document.getElementById(id)).toBeTruthy();
    expect(screen.queryByTestId("rail")).toBeNull();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getAllByRole("link").map((a) => a.textContent)).toEqual(["GitHub", "MIT License"]);
  });

  it('"Get started" goes to /graph; "Agents" scrolls to the Agents section', () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/graph");
    const veil = screen.getByTestId("hero-veil");
    expect(within(veil).getByRole("link", { name: "Agents" }).getAttribute("href")).toBe("#agents");
  });

  it("the hero mark is a button that howls on click, in currentColor", () => {
    reducedMotion(false);
    render(<Home />);
    const logo = screen.getByTestId("hero-logo");
    expect(logo.tagName).toBe("BUTTON");
    for (const p of logo.querySelectorAll("path")) expect(p.getAttribute("fill")).toBe("currentColor");
  });

  it("with reduced motion the hero mark never howls, on load or on click", () => {
    vi.useFakeTimers();
    reducedMotion(true);
    render(<Home />);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByTestId("hero-logo"));
    expect(screen.getByTestId("hero-logo").querySelector("[data-howling]")).toBeNull();
  });
});

describe("nav logo, NVIDIA logos and the roadmap flow", () => {
  it("the nav logo is a howling link to the landing page", () => {
    reducedMotion(false);
    render(<Home />);
    const logo = screen.getByTestId("nav-logo");
    expect(logo.getAttribute("href")).toBe("/");
    expect(logo.textContent).toBe("TraceHound");
    expect(logo.querySelector("[data-wolf-face]")).toBeTruthy();
  });

  it("Models shows NVIDIA's colour logo, and every Nemotron row its eye", () => {
    render(<Home />);
    expect(screen.getByTestId("nvidia-logo").getAttribute("src")).toBe("/icons/nvidia-color.svg");
    const rows = within(screen.getByTestId("agent-rows")).getAllByRole("listitem");
    for (const row of rows) expect(!!row.querySelector('img[src="/icons/nvidia-color-eye.svg"]'), row.textContent!).toBe(row.textContent!.includes("Nemotron"));
  });

  it("the roadmap flow: now, then the four planned items; it plays once and a click never replays it", () => {
    reducedMotion(false);
    render(<Home />);
    const flow = screen.getByTestId("roadmap-flow");
    expect(within(flow).getByTestId("roadmap-now").textContent).toContain("Now");
    expect(within(flow).getAllByTestId("roadmap-item").map((i) => i.textContent)).toEqual([
      "PlannedConnect a GitHub repoAnalyze a repo you connect, not only a pinned snapshot.",
      "PlannedLive code workingsThe graph shows the running system from real events.",
      "PlannedFindings to a pull requestThe findings pipeline runs through to a pull request.",
      "PlannedNebius SandboxesA second sandbox provider beside local Docker.",
    ]);
    expect(within(flow).queryByRole("button")).toBeNull();
    expect(flow.dataset.state).toBe("play"); // jsdom has no IntersectionObserver: it plays at once
    const items = flow.querySelectorAll("li");
    fireEvent.click(flow);
    expect(flow.querySelectorAll("li")[0]).toBe(items[0]); // not re-mounted: nothing replays
  });

  it("the roadmap flow is static under reduced motion", () => {
    reducedMotion(true);
    render(<Home />);
    expect(screen.getByTestId("roadmap-flow").dataset.state).toBe("static");
  });
});

describe("old viewer links on /", () => {
  /** Runs the landing page's inline script against a fake location. */
  function runScript(search: string, hash = "") {
    const replace = vi.fn();
    const doc = { documentElement: { style: { visibility: "" } } };
    new Function("location", "document", LEGACY_REDIRECT_SCRIPT)({ search, hash, replace }, doc);
    return { replace, hidden: doc.documentElement.style.visibility === "hidden" };
  }

  it("is the first thing in the landing page, before the nav and hero", () => {
    render(<Home />);
    const first = screen.getByTestId("landing").firstElementChild!;
    expect(first.tagName).toBe("SCRIPT");
    expect(first.innerHTML).toBe(LEGACY_REDIRECT_SCRIPT);
  });

  it.each(["?repo=recall", `?changes=${COMMIT.changeSet}`, "?impact=seed-queue-consumer", "?repo=recall&component=recall-backend%3Aworker"])("%s goes to /graph with the same query, hidden meanwhile", (search) => {
    const { replace, hidden } = runScript(search, "#x");
    expect(replace).toHaveBeenCalledWith(`/graph${search}#x`);
    expect(hidden).toBe(true);
  });

  it.each(["", "?utm_source=x", "?repository=x"])('"%s" stays on the landing page', (search) => {
    const { replace, hidden } = runScript(search);
    expect(replace).not.toHaveBeenCalled();
    expect(hidden).toBe(false);
  });

  it("the redirected URL reaches the viewer: /graph?changes= opens the change view", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const file = path.join(ROOT, url.split("?")[0]!);
      try {
        return new Response(readFileSync(file), { status: 200, headers: { "content-type": "application/json" } });
      } catch {
        return new Response("not found", { status: 404 });
      }
    });
    const { replace } = runScript(`?changes=${COMMIT.changeSet}`);
    window.history.replaceState(null, "", replace.mock.calls[0]![0]);
    render(
      <div style={{ width: 1400, height: 900 }}>
        <GraphPage />
      </div>,
    );
    await waitFor(() => expect(screen.getByTestId("change-summary")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId("exit-changes").getAttribute("href")).toBe("/graph?repo=recall");
    for (const link of screen.getAllByTestId("home-link")) expect(link.getAttribute("href")).toBe("/graph");
  });
});

describe("the strikethrough line and its caption", () => {
  const added = changeSet.files.reduce((n, f) => n + f.linesAdded, 0);
  const removed = changeSet.files.reduce((n, f) => n + f.linesRemoved, 0);
  const s = changeSet.stats;

  it("its numbers equal the changeset's stats", () => {
    render(<Home />);
    const lines = (added + removed).toLocaleString("en-US");
    expect(screen.getByTestId("strike-line").textContent).toBe(`Don't read ${lines} lines. Read ${s.declarations.added + s.declarations.modified}.`);
    expect(screen.getByTestId("strike").textContent).toBe(lines);
    expect(screen.getByTestId("commit-caption").textContent!.replace(/\s+/g, " ")).toBe(
      `Recall commit 7943212 · ${changeSet.files.length} files · ${added.toLocaleString("en-US")} added, ${removed} removed → ${s.declarations.added} declarations added, ${s.declarations.modified} modified, ${s.edges.added} new edge`,
    );
    expect(screen.getByTestId("commit-caption").getAttribute("href")).toBe("/graph?changes=recall-7943212");
  });

  it("the prompt's figures: 15 files, 1,913 + 127 = 2,040 lines, 3 + 5 = 8 declarations, 1 edge", () => {
    expect([changeSet.files.length, added, removed, s.declarations.added, s.declarations.modified, s.edges.added]).toEqual([15, 1913, 127, 3, 5, 1]);
    expect([COMMIT.files, COMMIT.linesAdded, COMMIT.linesRemoved, COMMIT.declarationsAdded, COMMIT.declarationsModified, COMMIT.edgesAdded]).toEqual([15, 1913, 127, 3, 5, 1]);
  });
});

describe("the animations", () => {
  const figures = ["diff", "graph", "pipeline"] as const;

  it("under reduced motion each shows its final frame, static, not a button, with its caption as the text alternative", () => {
    reducedMotion(true);
    render(<Home />);
    for (const name of figures) {
      const figure = screen.getByTestId(`anim-${name}`);
      expect(figure.dataset.state, name).toBe("static");
      expect(figure.querySelector(".lp-anim")!.getAttribute("data-state")).toBe("static");
      expect(within(figure).queryByRole("button")).toBeNull();
      const img = within(figure).getByRole("img");
      expect(document.getElementById(img.getAttribute("aria-labelledby")!)!.tagName).toBe("FIGCAPTION");
    }
    // the final frames: 8 declarations and both components; 5 nodes and 6 labelled edges; the test passing
    const diff = screen.getByTestId("anim-diff");
    expect(within(diff).getByTestId("diff-counter").textContent).toBe("8 declarations");
    expect(within(diff).getAllByTestId("dropped-file")).toHaveLength(11);
    expect(within(diff).getAllByTestId("kept-file")).toHaveLength(4);
    expect(within(diff).getAllByTestId("declaration-row")).toHaveLength(8);
    expect(within(diff).getAllByTestId("change-component-name").map((c) => c.textContent)).toEqual(["Recall API", "Shared Recall"]);
    expect(within(diff).getByTestId("new-edge").textContent).toBe("calls · index.ts:320");
    // repo → graph and the pipeline: a wide drawing (lg and up) and a narrow one, both final
    const variant = (name: string, v: "wide" | "narrow") => screen.getByTestId(`anim-${name}`).querySelector<HTMLElement>(`[data-variant="${v}"]`)!;
    const labels = ["index.ts:153", "worker.ts:111", "index.ts:15", "index.ts:11", "worker.ts:8", "worker.ts:6"];
    for (const v of ["wide", "narrow"] as const) {
      const graph = variant("graph", v);
      expect(within(graph).getAllByTestId("graph-node"), v).toHaveLength(5);
      expect(within(graph).getAllByTestId("edge-label").map((l) => l.textContent), v).toEqual(labels);
      const pipeline = variant("pipeline", v);
      expect(within(pipeline).getAllByTestId("pipeline-stage").map((s) => s.querySelector("text")!.textContent), v).toEqual(["find", "reproduce", "repair", "verify"]);
    }
    const wide = variant("graph", "wide");
    expect(within(wide).getAllByTestId("tree-row")).toHaveLength(15);
    expect(within(wide).getAllByTestId("fact-chip").map((c) => c.textContent)).toEqual(["env L4", "new Queue L10", "queue.add L153", "new Worker L111"]);
    expect(within(variant("pipeline", "wide")).getAllByTestId("verify-check").map((c) => c.textContent)).toEqual(["✓reproduction test", "✓existing tests", "✓typecheck"]);
    expect(within(variant("pipeline", "wide")).getByTestId("test-passes").textContent).toBe("RESOLVED");
    expect(within(variant("pipeline", "narrow")).getByTestId("test-passes").textContent).toContain("test passes");
    // every caption is a numbered list of four steps
    for (const name of figures) expect(within(screen.getByTestId(`anim-${name}`)).getAllByRole("listitem"), name).toHaveLength(4);
  });

  it("with motion each is a replay button (paused until in view; jsdom has no IntersectionObserver, so it plays)", () => {
    reducedMotion(false);
    render(<Home />);
    for (const name of figures) {
      const figure = screen.getByTestId(`anim-${name}`);
      const button = within(figure).getByRole("button");
      expect(button.getAttribute("aria-label")).toMatch(/^Replay the animation: /);
      expect(figure.dataset.state).toBe("play");
      fireEvent.click(button);
      expect(figure.dataset.state).toBe("play");
    }
  });
});

describe("every name and number in the animations and sections comes from the repo", () => {
  it("diff → declarations: the changeset's 8 counted declarations, their components and the added edge", () => {
    const counted = changeSet.declarations.filter((d) => d.status === "added" || (d.status === "modified" && !(d.modifications.length === 1 && d.modifications[0] === "formatting")));
    expect(DECLARATIONS.map((d) => [d.status, d.name, d.file, d.component])).toEqual(counted.map((d) => [d.status, d.name, d.file, d.componentId]));
    expect(CHANGE_COMPONENTS.map((c) => c.id)).toEqual(changeSet.components.map((c) => c.id));
    // the names the viewer shows for those components (the snapshot's), not the changeset's heuristic ones
    const snapshot = json(RECALL_SNAPSHOT);
    for (const c of CHANGE_COMPONENTS) expect(c.name).toBe(snapshot.components.find((x: { id: string }) => x.id === c.id).name);
    // the 15 files: paths, status and counts; `declarations` is true exactly for the files holding a counted declaration
    expect(COMMIT_FILES.map((f) => [f.path, f.status, f.added, f.removed])).toEqual(
      (changeSet.files as unknown as { path: string; status: string; linesAdded: number; linesRemoved: number }[]).map((f) => [f.path, f.status, f.linesAdded, f.linesRemoved]),
    );
    for (const f of COMMIT_FILES) expect(f.declarations, f.path).toBe(counted.some((d) => d.file === f.path));
    // the rest: ignored by Recall's config, or not TypeScript
    expect(json("configs/recall.tracehound.json").ignore).toContain(IGNORED_BY_CONFIG);
    for (const f of COMMIT_FILES.filter((x) => !x.declarations)) expect(f.path.startsWith(IGNORED_BY_CONFIG.replace("**", "")) || !/\.tsx?$/.test(f.path), f.path).toBe(true);
    const edge = changeSet.edges.filter((e) => e.status === "added");
    expect(edge).toHaveLength(1);
    expect(edge[0]).toMatchObject({ kind: ADDED_EDGE.kind, from: `${ADDED_EDGE.file}#${ADDED_EDGE.from}` });
    expect(edge[0]!.to.endsWith(`#${ADDED_EDGE.to}`)).toBe(true);
    expect(edge[0]!.evidence[0]).toMatchObject({ side: "head", file: ADDED_EDGE.file, line: ADDED_EDGE.line });
  });

  it("repo → graph: Recall's snapshot components, edges and evidence", () => {
    const manifest = json("snapshots/index.json");
    expect(manifest.repos.find((r: { id: string }) => r.id === "recall").latest.path).toBe(RECALL_SNAPSHOT.replace("snapshots/", ""));
    const snapshot = json(RECALL_SNAPSHOT);
    expect(snapshot.repo.commitSha.startsWith(RECALL.short)).toBe(true);
    expect(snapshot.analyzerVersion).toBe(RECALL.analyzerVersion);
    expect(snapshot.components).toHaveLength(RECALL_COMPONENTS);
    const evidence = new Map(snapshot.evidence.map((e: { id: string }) => [e.id, e]));
    for (const c of GRAPH_COMPONENTS) {
      const s = snapshot.components.find((x: { id: string }) => x.id === c.id);
      expect(c.name, c.id).toBe(s.name);
      expect(c.model, c.id).toBe(s.naming.source === "llm");
      expect(c.kind, c.id).toBe(s.kind);
    }
    expect(GRAPH_EDGES.map((e) => e.id).sort()).toEqual(snapshot.edges.map((e: { id: string }) => e.id).sort());
    for (const e of GRAPH_EDGES) {
      const s = snapshot.edges.find((x: { id: string }) => x.id === e.id);
      expect([s.source, s.target, s.kind]).toEqual([e.from, e.to, e.kind]);
      expect(s.evidenceIds).toContain(e.evidence);
      const ev = evidence.get(e.evidence) as { file: string; range: { startLine: number } };
      expect(`${ev.file}:${ev.range.startLine}`).toBe(`${GRAPH_PATH_PREFIX}${e.file}:${e.line}`);
    }
    for (const f of GRAPH_FILES) {
      const ev = evidence.get(f.evidence) as { file: string };
      expect(ev.file).toBe(f.path);
      expect(snapshot.components.find((c: { id: string }) => c.id === f.component).files).toContain(f.path);
    }
  });

  it("repo → graph's tree: the backend files of the five components, as the snapshot groups them", () => {
    const snapshot = json(RECALL_SNAPSHOT);
    const expected = GRAPH_COMPONENTS.flatMap((c) => (snapshot.components.find((x: { id: string }) => x.id === c.id).files as string[]).map((path) => ({ path, component: c.id })));
    expect([...GRAPH_TREE].sort((a, b) => a.path.localeCompare(b.path))).toEqual(expected.sort((a, b) => a.path.localeCompare(b.path)));
  });

  it("the pipeline's rule and question are the finder's, word for word", () => {
    const rules = text("packages/analyzer/src/finder/rules.ts");
    expect(rules).toContain(`RULES["${FINDER_RULE.id}"]`);
    expect(rules).toContain(`question: \`${FINDER_RULE.question.replace("<METHOD>", "${r.method}").replace("<path>", "${chain.fullPath}")}\``);
  });

  it("the model ids are the code's", () => {
    expect(text("packages/analyzer/src/naming/llm.ts")).toContain(`export const DEFAULT_MODEL = "${MODELS[0].id}";`);
    expect(Object.keys(json("config/prices.json").models)).toContain(MODELS[1].id);
  });

  it("the held-out numbers are docs/eval/heldout-results.md's", () => {
    const doc = text("docs/eval/heldout-results.md");
    for (const [i, model] of ["Nano", "Super"].entries()) {
      const row = HELDOUT.rows[i]!;
      expect(doc).toContain(`| ${model} | graph-on | ${HELDOUT.perArm} | ${row.resolvedOn} | ${row.verifiedOn} |`);
      expect(doc).toContain(`| ${model} | graph-off | ${HELDOUT.perArm} | ${row.resolvedOff} | ${row.verifiedOff} |`);
    }
    expect(doc).toContain(`${HELDOUT.tasks} seeded tasks`);
    expect(doc).toContain(`${HELDOUT.repeats} repeats, concurrency 1: ${HELDOUT.runs} counted runs`);
    expect(doc).toContain(`The agent never called a graph tool in ${HELDOUT.graphOnRuns} graph-on runs`);
  });
});

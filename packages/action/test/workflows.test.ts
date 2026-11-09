import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate, parseYaml, scalar, truthy, type Yaml } from "./yaml-lite.ts";

// Every workflow that can call Nebius starts only by hand (workflow_dispatch) or from the
// `tracehound-review` PR label; unlabelled pushes and pull requests never start a model-calling job.
const root = path.resolve(import.meta.dirname, "../../..");
const workflowsDir = path.join(root, ".github/workflows");
const files = readdirSync(workflowsDir).filter(f => /\.ya?ml$/.test(f)).sort();
type Map = { [key: string]: Yaml };
const asMap = (v: Yaml | undefined): Map => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const read = (file: string) => ({ text: readFileSync(file, "utf8"), doc: asMap(parseYaml(readFileSync(file, "utf8"))) });
const triggers = (doc: Map): Map => {
  const on = doc.on;
  if (typeof on === "string") return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map(e => [String(e), null]));
  return asMap(on);
};
const steps = (job: Map) => (Array.isArray(job.steps) ? job.steps : []).map(asMap);
const REVIEW_ACTION = /tracehound-review(@|$)/;
/** A job that can call Nebius: it hands the NEBIUS_API_KEY secret to a step, unless that step is the
 * review action with max-comments '0' (action.ts returns before any model call). */
function callsNebius(job: Map): boolean {
  return steps(job).some(step => {
    const text = JSON.stringify(step);
    if (!text.includes("secrets.NEBIUS_API_KEY")) return false;
    const w = asMap(step.with);
    return !(typeof step.uses === "string" && REVIEW_ACTION.test(step.uses) && String(w["max-comments"]) === "0");
  });
}
const jobs = (doc: Map) => Object.entries(asMap(doc.jobs)).map(([id, job]) => ({ id, job: asMap(job) }));

// Event contexts, with what GitHub sets for each (github.event_name, github.event, inputs).
const pr = (action: string, label?: string) => ({
  github: { event_name: "pull_request", repository: "owner/repo",
    event: { action, ...(label && { label: { name: label } }), pull_request: { number: 7, draft: false, head: { sha: "abc", repo: { full_name: "owner/repo" } } } } },
  inputs: {},
});
const AUTOMATIC = {
  push: { github: { event_name: "push", repository: "owner/repo", event: {} }, inputs: {} },
  "pull_request opened": pr("opened"), "pull_request synchronize": pr("synchronize"), "pull_request reopened": pr("reopened"),
  "pull_request ready_for_review": pr("ready_for_review"), "pull_request labeled (other label)": pr("labeled", "bug"),
  schedule: { github: { event_name: "schedule", repository: "owner/repo", event: {} }, inputs: {} },
};
const MANUAL = {
  "pull_request labeled tracehound-review": pr("labeled", "tracehound-review"),
  workflow_dispatch: { github: { event_name: "workflow_dispatch", repository: "owner/repo", event: { inputs: { pr: 7 } } }, inputs: { pr: 7 } },
};
const runs = (job: Map, context: object) => job.if === undefined || truthy(evaluate(String(job.if), context as Record<string, unknown>));

describe("yaml-lite reads what the tests rely on", () => {
  it("parses maps, sequences, flow lists, quotes, comments and block scalars", () => {
    expect(parseYaml("on:\n  pull_request:\n    types: [labeled] # c\njobs:\n  a:\n    if: >-\n      x ==\n      'y'\n    steps:\n      - uses: a@b # pin\n        with:\n          k: ''\n      - run: |\n          echo 'a: b' # kept\n")).toEqual({
      on: { pull_request: { types: ["labeled"] } },
      jobs: { a: { if: "x == 'y'", steps: [{ uses: "a@b", with: { k: "" } }, { run: "echo 'a: b' # kept\n" }] } },
    });
    expect(scalar("'it''s'")).toBe("it's");
    expect(() => parseYaml("a: &x 1\nb: *x\n")).toThrow();
  });
  it("evaluates GitHub expressions", () => {
    const c = { github: { event_name: "pull_request", event: { label: { name: "tracehound-review" }, pull_request: { draft: false } } } };
    expect(evaluate("github.event_name == 'pull_request' && github.event.label.name == 'tracehound-review' && !github.event.pull_request.draft", c)).toBe(true);
    expect(evaluate("${{ github.event_name == 'workflow_dispatch' || (github.event.label.name == 'other') }}", c)).toBe(false);
  });
});

describe("workflows that can call Nebius start only by hand or from the tracehound-review label", () => {
  const all = files.map(file => ({ file, ...read(path.join(workflowsDir, file)) }));

  it("classifies every workflow in .github/workflows (a new model-calling workflow must be added here on purpose)", () => {
    const calling = all.filter(w => jobs(w.doc).some(j => callsNebius(j.job))).map(w => w.file);
    expect(calling).toEqual(["reviewbench-smoke.yml", "tracehound-review.yml"]);
    // ci.yml and the image build get no secret at all except GITHUB_TOKEN, so they cannot make a billed call.
    for (const f of ["ci.yml", "reviewbench-image.yml"]) {
      const text = all.find(w => w.file === f)!.text;
      expect(text).not.toContain("secrets.NEBIUS_API_KEY");
      expect(text.match(/secrets\.\w+/g) ?? []).toEqual(f === "ci.yml" ? [] : ["secrets.GITHUB_TOKEN"]);
    }
    // The install matrix uses the action with an empty key only (the review step is cut or skipped).
    const matrix = all.find(w => w.file === "action-install-matrix.yml")!;
    const uses = jobs(matrix.doc).flatMap(j => steps(j.job)).filter(s => typeof s.uses === "string" && /tracehound-(review|install-only)$/.test(s.uses));
    expect(uses.length).toBe(2);
    for (const s of uses) expect(asMap(s.with)["nebius-api-key"]).toBe("");
    expect(matrix.text).not.toContain("NEBIUS_API_KEY");
  });

  for (const w of all) {
    const nebiusJobs = jobs(w.doc).filter(j => callsNebius(j.job));
    if (!nebiusJobs.length) continue;
    it(`${w.file}: no automatic trigger, and its model-calling jobs run only on dispatch or the label`, () => {
      const on = triggers(w.doc);
      expect(Object.keys(on).every(t => t === "workflow_dispatch" || t === "pull_request")).toBe(true);
      expect(Object.keys(on)).toContain("workflow_dispatch");
      if ("pull_request" in on) {
        expect(asMap(on.pull_request)).toEqual({ types: ["labeled"] });
      }
      for (const { job } of nebiusJobs) {
        for (const [name, context] of Object.entries(AUTOMATIC)) {
          const started = name.split(" ")[0]! in on && runs(job, context);
          expect({ name, started }).toEqual({ name, started: false });
        }
        if ("pull_request" in on) {
          expect(String(job.if)).toContain("github.event.label.name == 'tracehound-review'");
          expect(runs(job, MANUAL["pull_request labeled tracehound-review"])).toBe(true);
        }
        expect(runs(job, MANUAL.workflow_dispatch)).toBe(true);
      }
    });
  }

  it("tracehound-review.yml reviews the dispatched PR's head and passes its number to the action", () => {
    const { doc } = all.find(w => w.file === "tracehound-review.yml")!;
    expect(asMap(asMap(asMap(triggers(doc).workflow_dispatch).inputs).pr)).toMatchObject({ required: true, type: "number" });
    const [checkout, review] = steps(asMap(asMap(doc.jobs).review));
    const ref = String(asMap(checkout!.with).ref);
    expect(evaluate(ref, MANUAL.workflow_dispatch)).toBe("refs/pull/7/head");
    expect(evaluate(ref, MANUAL["pull_request labeled tracehound-review"])).toBe("abc");
    expect(asMap(review!.with)["pr-number"]).toBe("${{ inputs.pr }}");
    expect(String(review!.uses)).toMatch(/^SunnyBagal\/TraceHound\/\.github\/actions\/tracehound-review@[0-9a-f]{40}$/);
  });
});

describe("the documented example workflow", () => {
  const { doc } = read(path.join(root, "docs/action/example-workflow.yml"));
  const on = triggers(doc);
  it("starts its review job only by hand or from the label; the data job makes no model call", () => {
    const review = jobs(doc).filter(j => callsNebius(j.job));
    expect(review.map(j => j.id)).toEqual(["review"]);
    for (const [name, context] of Object.entries(AUTOMATIC)) {
      const started = name.split(" ")[0]! in on && runs(review[0]!.job, context);
      expect({ name, started }).toEqual({ name, started: false });
    }
    for (const context of Object.values(MANUAL)) expect(runs(review[0]!.job, context)).toBe(true);
    const data = asMap(asMap(doc.jobs).data);
    expect(steps(data).filter(s => typeof s.uses === "string" && REVIEW_ACTION.test(s.uses)).map(s => asMap(s.with)["max-comments"])).toEqual(["0"]);
    expect(runs(data, MANUAL["pull_request labeled tracehound-review"])).toBe(false);
  });
});

describe("the composite action's review step", () => {
  const { doc } = read(path.join(root, ".github/actions/tracehound-review/action.yml"));
  const step = steps(asMap(doc.runs)).find(s => s.name === "Review and post findings")!;
  const withInputs = (context: { github: object }, prNumber: string) => ({ ...context, inputs: { "pr-number": prNumber } });
  it("runs on pull_request (not closed) and on workflow_dispatch only with a pr-number", () => {
    expect(asMap(asMap(doc.inputs)["pr-number"])).toMatchObject({ required: false, default: "" });
    expect(asMap(step.env).TRACEHOUND_PR_NUMBER).toBe("${{ inputs.pr-number }}");
    expect(runs(step, withInputs(MANUAL["pull_request labeled tracehound-review"], ""))).toBe(true);
    expect(runs(step, withInputs(pr("closed"), ""))).toBe(false);
    expect(runs(step, withInputs(MANUAL.workflow_dispatch, "7"))).toBe(true);
    // action-install-matrix.yml dispatches the action without a pr-number: the review step stays skipped.
    expect(runs(step, withInputs(MANUAL.workflow_dispatch, ""))).toBe(false);
    expect(runs(step, withInputs(AUTOMATIC.push, ""))).toBe(false);
  });
});

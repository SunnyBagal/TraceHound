// scripts/testset/tools.json (decision 076h; S1.md step 7): the logins and notCompletion patterns from S1's readings
// (tracehound-testset run/out/bunny.s1-retrigger.md). Bodies below copy the bots' fixed wording and HTML shape only; no case text.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTools } from "../../../scripts/testset/window-scheduler.ts";
import { main as collectMain } from "../../../scripts/testset/collect-tool-reviews.ts";

const TOOLS = path.resolve(import.meta.dirname, "../../../scripts/testset/tools.json");
const TOOLS_S1 = path.resolve(import.meta.dirname, "../../../scripts/testset/tools.s1.json");

// the four CodeRabbit messages S1 saved that do not mean a review ran (exact fixed wording, CodeRabbit's wrappers)
const reply = (summary: string, line: string) =>
  `<!-- This is an auto-generated reply by CodeRabbit -->\n<details>\n<summary>${summary}</summary>\n<dl>\n<dd>\n<br>\n\n${line}\n\n</dd>\n</dl>\n</details>`;
const CR_NOT_COMPLETION = {
  rateLimitedReply: reply("Action not completed", "Review rate limited."),
  limitReached: "> [!WARNING]\n> ## Review limit reached\n> \n> You've used all free OSS reviews for now. Wait for the free limit to reset to keep reviewing this public repository.\n> \n> **Next included review available in 59 minutes.**",
  processing: "> [!NOTE]\n> \n> \n> Currently processing new changes in this PR. This may take a few minutes, please wait...",
  triggered: reply("Action performed", "Full review triggered."),
};
// what the same comments became once a review ran, and Greptile's review comment and check-run text
const COMPLETED = {
  finishedReply: reply("Action performed", "Full review finished."),
  walkthrough: "## Walkthrough\nNo actionable comments were generated in the recent review.\n- **Review profile**: CHILL\n- **Plan**: Advanced\n" +
    "**Included review availability:** This review used your included allowance. Your plan provides up to 1 included review per hour; 0 remain after this review.",
  greptile: "<h2>Confidence Score: 5/5</h2>\n**[Medium impact]** The PR appears safe to merge; no actionable issues were found.\n<h3>Summary</h3>",
  greptileCheck: "Greptile has reviewed the Pull Request.\n\n3 files reviewed, 0 comments added.",
};

describe("tools.json (decision 076h): logins and notCompletion patterns observed in S1", () => {
  const cfg = JSON.parse(readFileSync(TOOLS, "utf8"));
  const patterns = (tool: string) => (cfg.tools[tool].notCompletion as string[]).map((x) => new RegExp(x, "i")); // as the collector compiles them

  it("has tools.s1.json's schema and tool order, the observed logins, 4 CodeRabbit patterns and an explicit [] for Greptile, and no held-out or case details", () => {
    const raw = readFileSync(TOOLS, "utf8");
    expect(cfg).toEqual({ v: 1, tools: {
      coderabbit: { logins: ["coderabbitai[bot]"], notCompletion: [
        "Review rate limited\\.",
        "You've used all free OSS reviews for now\\. Wait for the free limit to reset to keep reviewing this public repository\\.",
        "Currently processing new changes in this PR\\. This may take a few minutes, please wait\\.\\.\\.",
        "Full review triggered\\."] },
      greptile: { logins: ["greptile-apps[bot]"], notCompletion: [] } } });
    expect(Object.keys(cfg.tools)).toEqual(Object.keys(JSON.parse(readFileSync(TOOLS_S1, "utf8")).tools));
    expect(readTools(TOOLS)).toEqual(["coderabbit", "greptile"]);
    expect(raw).not.toMatch(/held-?out|ho-\d|case-\d|SunnyBagal|[0-9a-f]{12}/i);
  });

  it("each CodeRabbit pattern matches exactly its own saved message, and none matches a message from a completed review", () => {
    const cr = patterns("coderabbit");
    const texts = Object.values(CR_NOT_COMPLETION);
    cr.forEach((re, i) => expect(texts.map((t) => re.test(t))).toEqual(texts.map((_, j) => j === i)));
    for (const t of Object.values(COMPLETED)) expect(cr.some((re) => re.test(t))).toBe(false);
    expect(patterns("greptile")).toEqual([]);
  });

  describe("the collector reads it (main, fake gh, no network)", () => {
    const HEAD = "a".repeat(40), BASE = "b".repeat(40);
    const START = "2026-11-20T00:00:00Z", END = "2026-11-23T00:00:00Z";
    const cr = { login: "coderabbitai[bot]", type: "Bot" }, gr = { login: "greptile-apps[bot]", type: "Bot" }, me = { login: "SunnyBagal", type: "User" };
    let n = 0;
    const ic = (user: object, body: string) => ({ id: ++n, user, created_at: "2026-11-21T00:00:00Z", body });
    const pr = { base: { sha: BASE }, head: { sha: HEAD } };
    const pulls = {
      // c1: CodeRabbit rate-limited (S1's first trigger on its second PR): both of its messages are left out → no-review
      11: { pr, comments: [], reviews: [], issueComments: [ic(me, "@coderabbitai full review"), ic(cr, CR_NOT_COMPLETION.rateLimitedReply), ic(cr, CR_NOT_COMPLETION.limitReached), ic(me, "@greptileai")] },
      // c2: CodeRabbit read while it was still running → no-review
      12: { pr, comments: [], reviews: [], issueComments: [ic(me, "@coderabbitai full review"), ic(cr, CR_NOT_COMPLETION.triggered), ic(cr, CR_NOT_COMPLETION.processing)] },
      // c3: both reviews ran with no inline comment (all four S1 reviews looked like this) → completed by issue comments, 0 counted
      13: { pr, comments: [], reviews: [], issueComments: [ic(me, "@coderabbitai full review"), ic(cr, COMPLETED.finishedReply), ic(cr, COMPLETED.walkthrough), ic(gr, COMPLETED.greptile)] },
    };
    function run(tool: string) {
      const d = mkdtempSync(path.join(os.tmpdir(), "tools-json-"));
      const dev = path.join(d, "dev");
      mkdirSync(dev, { recursive: true });
      copyFileSync(path.join(import.meta.dirname, "fixtures", "collector-fake-gh.mjs"), path.join(dev, "gh.mjs"));
      writeFileSync(path.join(dev, "gh"), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/gh.mjs" "$@"\n`, { mode: 0o755 });
      writeFileSync(path.join(dev, "gh.json"), JSON.stringify({ pulls }));
      writeFileSync(path.join(dev, "gh.log"), "");
      writeFileSync(path.join(dev, "manifest.json"), JSON.stringify(["c1", "c2", "c3"].map((id) => ({ id, title: id, base_sha: BASE, case_head_sha: HEAD }))));
      writeFileSync(path.join(dev, "prmap.json"), JSON.stringify({ c1: 11, c2: 12, c3: 13 }));
      const out = path.join(d, "out");
      const lines: string[] = [];
      const code = collectMain(["--side", "dev", "--tool", tool, "--config", TOOLS, "--repo", "SunnyBagal/twenty", "--manifest", path.join(dev, "manifest.json"),
        "--pr-map", path.join(dev, "prmap.json"), "--window-start", START, "--window-end", END, "--out", out, "--gh-bin", path.join(dev, "gh"),
        "--bound", "window-start"], { log: (l) => lines.push(l) });
      return { code, lines, status: JSON.parse(readFileSync(path.join(out, `${tool}.status.json`), "utf8")) };
    }

    it("CodeRabbit: rate-limit and in-progress messages are not completions; a finished review with no inline comment is", () => {
      const r = run("coderabbit");
      expect(r.code).toBe(0);
      expect(r.status).toEqual({ c1: "no-review", c2: "no-review", c3: "completed" });
      expect(r.lines.join("\n")).toMatch(/completed 1, no-review 2[\s\S]*0 counted comment[\s\S]*review 0, inline 0, issue comment 2; not completion \(pattern\) 4/);
    });

    it("Greptile: its review comment completes the case; a PR with only the trigger comment stays no-review", () => {
      const r = run("greptile");
      expect(r.code).toBe(0);
      expect(r.status).toEqual({ c1: "no-review", c2: "no-review", c3: "completed" });
      expect(r.lines.join("\n")).toMatch(/issue comment 1; not completion \(pattern\) 0/);
    });
  });
});

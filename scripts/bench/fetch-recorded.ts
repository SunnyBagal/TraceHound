// Fetch the recorded reviews of the benchmark forks (decision 054) into a folder outside the repo.
//   node scripts/bench/fetch-recorded.ts [--out ~/Projects/tracehound-bench/recorded] [--tools a,b] [--repos x,y]
// Writes <out>/<tool>/<repo>/pulls.json and <out>/<tool>/<repo>/pr-<n>.json. Prints counts only,
// never titles or comment text (Cal.com is the blind test set).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOOLS = ['greptile', 'coderabbit', 'augment', 'cursor', 'copilot'];
const REPOS = ['sentry', 'cal_dot_com', 'grafana', 'keycloak', 'discourse'];
const ORG = 'ai-code-review-evaluations';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const out = arg('--out') ?? join(homedir(), 'Projects/tracehound-bench/recorded');
const tools = arg('--tools')?.split(',') ?? TOOLS;
const repos = arg('--repos')?.split(',') ?? REPOS;

// `gh api --paginate` concatenates pages; `--slurp` with jq-free output gives one array of pages.
function ghList(path: string): unknown[] {
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = execFileSync('gh', ['api', '--paginate', '--slurp', path], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const pages = JSON.parse(raw) as unknown[][];
      return pages.flat();
    } catch (err) {
      if (attempt >= 3) throw new Error(`gh api ${path} failed after 3 attempts: ${(err as Error).message.split('\n')[0]}`);
    }
  }
}

for (const tool of tools) {
  for (const repo of repos) {
    const fork = `${ORG}/${tool}-${repo}`;
    const dir = join(out, tool, repo);
    mkdirSync(dir, { recursive: true });
    let pulls: Array<{ number: number; title: string; state: string }>;
    try {
      pulls = (ghList(`repos/${fork}/pulls?state=all&per_page=100`) as Array<{ number: number; title: string; state: string }>)
        .map((p) => ({ number: p.number, title: p.title, state: p.state }));
    } catch (err) {
      console.log(`${fork}\tERROR listing pulls: ${(err as Error).message}`);
      continue;
    }
    writeFileSync(join(dir, 'pulls.json'), JSON.stringify(pulls, null, 1));
    let lineComments = 0;
    let reviews = 0;
    let issueComments = 0;
    let files = 0;
    for (const p of pulls) {
      const file = join(dir, `pr-${p.number}.json`);
      let rec: { reviewComments: unknown[]; reviews: unknown[]; issueComments: unknown[]; files: string[] };
      if (existsSync(file)) {
        rec = JSON.parse(readFileSync(file, 'utf8'));
      } else {
        rec = {
          reviewComments: ghList(`repos/${fork}/pulls/${p.number}/comments?per_page=100`),
          reviews: ghList(`repos/${fork}/pulls/${p.number}/reviews?per_page=100`),
          issueComments: ghList(`repos/${fork}/issues/${p.number}/comments?per_page=100`),
          files: (ghList(`repos/${fork}/pulls/${p.number}/files?per_page=100`) as Array<{ filename: string }>).map((f) => f.filename),
        };
        writeFileSync(file, JSON.stringify({ number: p.number, title: p.title, state: p.state, ...rec }, null, 1));
      }
      lineComments += rec.reviewComments.length;
      reviews += rec.reviews.length;
      issueComments += rec.issueComments.length;
      files += rec.files.length;
    }
    console.log(`${fork}\tpulls=${pulls.length}\tlineComments=${lineComments}\treviews=${reviews}\tissueComments=${issueComments}\tfiles=${files}`);
  }
}

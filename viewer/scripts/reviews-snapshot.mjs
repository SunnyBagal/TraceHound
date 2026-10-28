#!/usr/bin/env node
// Writes viewer/public/reviews/<owner>__<repo>.json: the PR lane's fallback when GitHub's
// anonymous rate limit is used up (lib/pulls.ts). Run locally with your gh login:
//
//   node viewer/scripts/reviews-snapshot.mjs SunnyBagal/tracehound-demo
//
// It keeps public data only: each PR's number/title/state/dates/head sha, its changed files, and
// TraceHound's own latest review (the footer) with that review's inline comments. No other bot's
// or person's comments, no tokens. Blind benchmark repos are refused unless --allow-blind.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { latestTraceReview, reviewRepo } from "../lib/reviews.ts";

const args = process.argv.slice(2);
const repo = reviewRepo(args.find((a) => !a.startsWith("--")) ?? "SunnyBagal/tracehound-demo");
if (/(-seeded|^.+\/tracehound-seeds)$/i.test(repo) && !args.includes("--allow-blind")) {
  console.error(`${repo} holds blind pull requests until they are scored; pass --allow-blind once they are.`);
  process.exit(1);
}

const gh = (endpoint) => JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", endpoint], { encoding: "utf8", maxBuffer: 64 << 20 })).flat();
const BOT = "github-actions[bot]";

const pulls = [
  ...gh(`repos/${repo}/pulls?state=open&per_page=100`),
  ...gh(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`).slice(0, 30),
];
const unique = [...new Map(pulls.map((p) => [p.number, p])).values()].sort((a, b) => b.number - a.number);

const out = [];
for (const p of unique) {
  const files = gh(`repos/${repo}/pulls/${p.number}/files?per_page=100`).map(({ filename, status, additions, deletions, previous_filename }) => ({ filename, status, additions, deletions, ...(previous_filename ? { previous_filename } : {}) }));
  const reviews = gh(`repos/${repo}/pulls/${p.number}/reviews?per_page=100`).map(({ id, body, user, submitted_at }) => ({ id, body, user: user && { login: user.login }, submitted_at }));
  const review = latestTraceReview(reviews);
  const comments = review
    ? gh(`repos/${repo}/pulls/${p.number}/comments?per_page=100`)
        .filter((c) => c.pull_request_review_id === review.id && c.user?.login === BOT)
        .map(({ id, pull_request_review_id, path: file, body, line, original_line, start_line, original_start_line, diff_hunk, commit_id, in_reply_to_id }) => ({
          id, pull_request_review_id, user: { login: BOT }, path: file, body, line, original_line, start_line, original_start_line, diff_hunk, commit_id, ...(in_reply_to_id ? { in_reply_to_id } : {}),
        }))
    : [];
  out.push({
    pull: { number: p.number, title: p.title, state: p.state, merged_at: p.merged_at, head: { sha: p.head.sha }, updated_at: p.updated_at },
    files,
    ...(review ? { review } : {}),
    comments,
  });
  console.log(`#${p.number}: ${files.length} files, ${review ? `${comments.length} TraceHound comments` : "no TraceHound review"}`);
}

const dir = path.resolve(import.meta.dirname, "../public/reviews");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${repo.replace("/", "__")}.json`);
writeFileSync(file, `${JSON.stringify({ version: 1, repo, generatedAt: new Date().toISOString(), pulls: out }, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), file)} (${out.length} pull requests)`);

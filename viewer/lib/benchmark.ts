/** Aggregate tables only, transcribed from docs/bench/results.md at the pinned revision. */
export const BENCHMARK_REVISION = "e4e3e3a8c4d46c270c6027dca564cfe3acb8bc52";
export const BENCHMARK_SOURCE = `https://github.com/SunnyBagal/TraceHound/blob/${BENCHMARK_REVISION}/docs/bench/results.md`;
export const BENCHMARK_TABLES = [
  {
    title: "Blind test: Cal.com run 1",
    note: "10 pull requests, n = 23. The pre-registered primary run. Secondary rows are not ranked. No gap to another tool is outside its 95% interval (audit-cc01 §3.2).",
    headers: ["reviewer", "comments", "TP", "FP", "FN", "P (n)", "R (n)", "F (v1)", "F (x1)"],
    rows: [
      ["augment", "23", "15", "3", "8", "83.3% (15/18)", "65.2% (15/23)", "73.2%", "73.2%"],
      ["cursor", "21", "13", "3", "10", "81.3% (13/16)", "56.5% (13/23)", "66.7%", "66.7%"],
      ["TraceHound (pool-verify-v1)", "30", "14", "11", "9", "56.0% (14/25)", "60.9% (14/23)", "58.3%", "58.3%"],
      ["greptile", "24", "10", "7", "13", "58.8% (10/17)", "43.5% (10/23)", "50.0%", "55.0%"],
      ["copilot", "49", "15", "27", "8", "35.7% (15/42)", "65.2% (15/23)", "46.2%", "50.8%"],
      ["coderabbit", "31", "9", "17", "14", "34.6% (9/26)", "39.1% (9/23)", "36.7%", "37.5%"],
      ["review-diff-v1 (secondary, not ranked)", "34", "14", "15", "9", "48.3% (14/29)", "60.9% (14/23)", "53.8%", "60.0%"],
      ["pool-raw (secondary, not ranked)", "43", "16", "23", "7", "41.0% (16/39)", "69.6% (16/23)", "51.6%", "56.1%"],
    ],
  },
  {
    title: "Rank in every test run",
    note: "Point-estimate ranks among six reviewers, not a ranking: no gap to another tool is outside its 95% interval. Repeats show spread. They are not additional chances to select a headline result.",
    headers: ["Cal.com run", "bench-judge-v1: F, point-estimate rank", "bench-judge-x1: F, point-estimate rank"],
    rows: [
      ["1 (headline)", "58.3%, 3rd", "58.3%, 3rd"],
      ["2", "51.3%, 3rd (n = 21, one JUDGE_FAILED)", "57.1%, 3rd"],
      ["3", "52.8%, 3rd", "47.3%, 5th (below greptile 55.0 and copilot 50.8)"],
    ],
  },
  {
    title: "Dev set",
    note: "40 pull requests, n = 74. Two completed runs; run 2r is the replacement for a void run.",
    headers: ["dev run", "bench-judge-v1", "bench-judge-x1"],
    rows: [
      ["1", "35.6%, 5th (above copilot only)", "44.6%, 5th (above copilot only)"],
      ["2r", "48.0%, 4th (below greptile 49.3, above coderabbit 41.0)", "53.4%, 4th (below greptile 55.1, above coderabbit 47.4)"],
    ],
  },
  {
    title: "Dev spread by variant",
    note: "Minimum / mean / maximum F across the two completed dev runs.",
    headers: ["row", "bench-judge-v1", "bench-judge-x1"],
    rows: [
      ["pool-verify-v1", "35.6 / 41.8 / 48.0%", "44.6 / 49.0 / 53.4%"],
      ["review-diff-v1", "32.2 / 33.9 / 35.6%", "35.7 / 35.9 / 36.0%"],
      ["pool-raw", "33.2 / 35.2 / 37.1%", "40.2 / 41.0 / 41.8%"],
    ],
  },
  {
    title: "All 50 PRs, bench-judge-v1 (scorer of record)",
    note: "Dev and Cal.com together, n = 97. Row (i), dev run 1 + Cal.com run 1, is the scorer-of-record line; row (ii), the dev 5-run mean + Cal.com run 1, is a variance check. Each is ranked against the five tools only.",
    headers: ["reviewer", "rank of 6", "TP", "FP", "FN", "P (n)", "R (n)", "F"],
    rows: [
      ["Augment", "1", "56", "16", "41", "77.8% (56/72)", "57.7% (56/97)", "66.3%"],
      ["Cursor", "2", "42", "17", "55", "71.2% (42/59)", "43.3% (42/97)", "53.8%"],
      ["Greptile", "3", "45", "40", "52", "52.9% (45/85)", "46.4% (45/97)", "49.5%"],
      ["TraceHound (i): dev run 1 + Cal.com run 1 (scorer-of-record line)", "4", "40", "57", "57", "41.2% (40/97)", "41.2% (40/97)", "41.2%"],
      ["TraceHound (ii): dev 5-run mean + Cal.com run 1 (variance check)", "4", "46.8", "59.2", "50.2", "44.2% (46.8/106)", "48.2% (46.8/97)", "46.1%"],
      ["CodeRabbit", "5", "41", "67", "56", "38.0% (41/108)", "42.3% (41/97)", "40.0%"],
      ["Copilot", "6", "43", "104", "54", "29.3% (43/147)", "44.3% (43/97)", "35.2%"],
    ],
  },
  {
    title: "All 50 PRs, bench-judge-x1 (report only)",
    note: "The same rows under the second judge. Both TraceHound rows are 4th of 6 under both judges.",
    headers: ["reviewer", "rank of 6", "TP", "FP", "FN", "P (n)", "R (n)", "F"],
    rows: [
      ["Augment", "1", "56", "17", "41", "76.7% (56/73)", "57.7% (56/97)", "65.9%"],
      ["Cursor", "2", "45", "11", "52", "80.4% (45/56)", "46.4% (45/97)", "58.8%"],
      ["Greptile", "3", "49", "32", "48", "60.5% (49/81)", "50.5% (49/97)", "55.1%"],
      ["TraceHound (i): dev run 1 + Cal.com run 1 (scorer-of-record line)", "4", "45", "45", "52", "50.0% (45/90)", "46.4% (45/97)", "48.1%"],
      ["TraceHound (ii): dev 5-run mean + Cal.com run 1 (variance check)", "4", "52.4", "48.0", "44.6", "52.2% (52.4/100.4)", "54.0% (52.4/97)", "53.1%"],
      ["CodeRabbit", "5", "45", "58", "52", "43.7% (45/103)", "46.4% (45/97)", "45.0%"],
      ["Copilot", "6", "50", "91", "47", "35.5% (50/141)", "51.5% (50/97)", "42.0%"],
    ],
  },
] as const;

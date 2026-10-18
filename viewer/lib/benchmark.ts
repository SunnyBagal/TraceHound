/** Aggregate tables only, transcribed from docs/bench/results.md at the pinned revision. */
export const BENCHMARK_REVISION = "e4e3e3a8c4d46c270c6027dca564cfe3acb8bc52";
export const BENCHMARK_SOURCE = `https://github.com/SunnyBagal/TraceHound/blob/${BENCHMARK_REVISION}/docs/bench/results.md`;
export const BENCHMARK_TABLES = [
  {
    title: "Blind test: Cal.com run 1",
    note: "10 pull requests, n = 23. The pre-registered primary run. Secondary rows are not ranked.",
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
    note: "Repeats show spread. They are not additional chances to select a headline result.",
    headers: ["Cal.com run", "bench-judge-v1", "bench-judge-x1"],
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
] as const;

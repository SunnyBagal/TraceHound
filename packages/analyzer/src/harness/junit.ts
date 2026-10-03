// Per-test results from a JUnit XML report (decision 043). Written against bun test's reporter
// (`bun test --reporter=junit --reporter-outfile=<file>`, bun 1.4.2): one <testsuite> per file, a
// nested <testsuite> per describe block, and <testcase file=… name=…> with a <failure>, <error> or
// <skipped> child when it didn't pass. No XML dependency: the reporter's output is regular and every
// attribute value is escaped.

export type TestStatus = "passed" | "failed" | "skipped";

/** One test, keyed by file + full name ("describe > inner > test"); the file is as the runner printed it. */
export interface TestResult {
  file: string;
  name: string;
  status: TestStatus;
}

const TAG = /<(\/?)(testsuites|testsuite|testcase|failure|error|skipped)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e]!,
  );
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR)) out[m[1]!] = decode(m[2] ?? m[3] ?? "");
  return out;
}

/**
 * Every <testcase> with its file, full name and status. Throws on input that isn't a JUnit report
 * (no <testsuites>/<testsuite> element), so a garbled file is never read as "no tests".
 * Two tests with the same file and full name get " (2)", " (3)" … in report order.
 */
export function parseJunit(xml: string): TestResult[] {
  if (!/<testsuites?\b/.test(xml)) throw new Error("not a JUnit report (no <testsuites> or <testsuite> element)");
  const suites: { name: string; file?: string }[] = [];
  const out: TestResult[] = [];
  let open: TestResult | undefined; // a <testcase> with children still to come
  for (const m of xml.matchAll(TAG)) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    const a = attrs(rawAttrs!);
    if (tag === "testsuite") {
      if (closing) suites.pop();
      else if (!selfClosing) suites.push({ name: a.name ?? "", ...(a.file !== undefined && { file: a.file }) });
    } else if (tag === "testcase") {
      if (closing) open = undefined;
      else {
        const file = a.file ?? suites.findLast((s) => s.file !== undefined)?.file ?? suites[0]?.name ?? "";
        // describe blocks are the nested suites; the outermost suite per file is the file itself
        const describes = suites.filter((s, i) => !(i === 0 && (s.name === file || s.name === s.file))).map((s) => s.name);
        const t: TestResult = { file, name: [...describes, a.name ?? ""].join(" > "), status: "passed" };
        out.push(t);
        open = selfClosing ? undefined : t;
      }
    } else if (open && !closing) {
      if (tag === "skipped") open.status = "skipped";
      else open.status = "failed"; // failure, error
    }
  }
  const seen = new Map<string, number>();
  for (const t of out) {
    const k = testKey(t);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) t.name = `${t.name} (${n})`;
  }
  return out;
}

export const testKey = (t: Pick<TestResult, "file" | "name">) => `${t.file}\0${t.name}`;

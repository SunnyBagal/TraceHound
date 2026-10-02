import type { FileFacts, TestLink } from "../schema.ts";

// *.test.ts / *.spec.ts (any TS/JS flavour) and anything under a __tests__/ directory.
const TEST_FILE = [/\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)__tests__\//];

export function isTestFile(path: string): boolean {
  return TEST_FILE.some((re) => re.test(path));
}

// A directory named test, tests or __tests__ anywhere in the path.
const TEST_DIR = /(^|\/)(test|tests|__tests__)\//;

/**
 * Test support (decision 042): a file under a test directory that isn't itself a test (helpers,
 * fixtures, a preload). Like a test file it keeps its facts but belongs to no component, so it
 * draws no component edge and is never an orphan. It makes no TESTS link: it is not a test.
 */
export function isTestSupportFile(path: string): boolean {
  return !isTestFile(path) && TEST_DIR.test(path);
}

/** A test file or test support: outside every component. */
export const isTestCode = (path: string): boolean => isTestFile(path) || isTestSupportFile(path);

/**
 * TESTS links: a test file → each component whose files it imports (resolved imports only).
 * Test files are not component members, so these links are the only place they show up in the
 * graph. Evidence is the import fact, like any other edge.
 */
export function testLinks(files: FileFacts[], fileToComponent: Map<string, string>): TestLink[] {
  const links = new Map<string, TestLink>();
  for (const f of files) {
    if (!isTestFile(f.path)) continue;
    for (const imp of f.imports) {
      const componentId = imp.target && !isTestCode(imp.target) ? fileToComponent.get(imp.target) : undefined;
      if (!componentId) continue;
      const key = `${f.path}->${componentId}`;
      const link = links.get(key) ?? { file: f.path, componentId, evidenceIds: [] };
      link.evidenceIds.push(imp.evidenceId);
      links.set(key, link);
    }
  }
  return [...links.values()]
    .map((l) => ({ ...l, evidenceIds: [...new Set(l.evidenceIds)].sort() }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.componentId.localeCompare(b.componentId));
}

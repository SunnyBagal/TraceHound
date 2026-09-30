import type { FileFacts, TestLink } from "../schema.ts";

// *.test.ts / *.spec.ts (any TS/JS flavour) and anything under a __tests__/ directory.
const TEST_FILE = [/\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)__tests__\//];

export function isTestFile(path: string): boolean {
  return TEST_FILE.some((re) => re.test(path));
}

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
      const componentId = imp.target && !isTestFile(imp.target) ? fileToComponent.get(imp.target) : undefined;
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

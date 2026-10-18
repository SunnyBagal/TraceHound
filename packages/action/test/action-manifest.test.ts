import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

const manifestUrl = new URL("../../../.github/actions/tracehound-review/action.yml", import.meta.url);
const packageUrl = new URL("../../../package.json", import.meta.url);

it("does not resolve a pnpm package file against the target repository", async () => {
  expect(await readFile(manifestUrl, "utf8")).not.toContain("package_json_file");
});

it("defaults fixes on and passes the input through TRACEHOUND_FIXES", async () => {
  const manifest = await readFile(manifestUrl, "utf8");
  expect(manifest).toMatch(/fixes:\n(?:[^\n]*\n)*?    default: 'on'/);
  expect(manifest).toContain("TRACEHOUND_FIXES: ${{ inputs.fixes }}");
});

it("pins pnpm to the version declared by TraceHound's root package", async () => {
  const manifest = await readFile(manifestUrl, "utf8");
  const rootPackage = JSON.parse(await readFile(packageUrl, "utf8")) as { packageManager: string };
  const rootVersion = /^pnpm@(.+)$/.exec(rootPackage.packageManager)?.[1];
  const actionVersion = /^\s+version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(manifest)?.[1];
  expect(rootVersion).toBeDefined();
  expect(actionVersion).toBe(rootVersion);
});

it("makes graph history opt-in, after review, and skips review for push and closed", async () => {
  const manifest = await readFile(manifestUrl, "utf8");
  expect(manifest).toMatch(/data-branch:\n(?:[^\n]*\n)*?    default: 'off'/);
  expect(manifest).toContain("github.event_name == 'pull_request' && github.event.action != 'closed'");
  expect(manifest).toContain("!cancelled() && inputs.data-branch == 'on'");
  expect(manifest.indexOf("name: Write graph history")).toBeGreaterThan(manifest.indexOf("name: Review and post findings"));
  expect(manifest).toContain("continue-on-error: true");
});

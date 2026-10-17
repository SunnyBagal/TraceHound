import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

const manifestUrl = new URL("../../../.github/actions/tracehound-review/action.yml", import.meta.url);
const packageUrl = new URL("../../../package.json", import.meta.url);

it("does not resolve a pnpm package file against the target repository", async () => {
  expect(await readFile(manifestUrl, "utf8")).not.toContain("package_json_file");
});

it("pins pnpm to the version declared by TraceHound's root package", async () => {
  const manifest = await readFile(manifestUrl, "utf8");
  const rootPackage = JSON.parse(await readFile(packageUrl, "utf8")) as { packageManager: string };
  const rootVersion = /^pnpm@(.+)$/.exec(rootPackage.packageManager)?.[1];
  const actionVersion = /^\s+version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(manifest)?.[1];
  expect(rootVersion).toBeDefined();
  expect(actionVersion).toBe(rootVersion);
});

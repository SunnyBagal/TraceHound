import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("documents the manifest's model default, explicit empty override, partial metadata and fix model", async () => {
  const [manifest, readme] = await Promise.all([
    readFile(new URL("../../../.github/actions/tracehound-review/action.yml", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/action/README.md", import.meta.url), "utf8"),
  ]);
  const model = /^  model:\n(?:    .*\n)*?    default: '([^']+)'/m.exec(manifest)?.[1];
  expect(model).toBeDefined();
  expect(readme).toContain(`| \`model\` | \`${model}\` |`);
  expect(readme).toContain("Explicit `model: ''` preserves each stage's CLI default");
  expect(readme).toContain("both reviewers failed every chunk");
  expect(readme).toContain("chunkFailed: { diff: n, ctx: n }");
  expect(readme).toContain("N of M reviewer chunks failed (invalid model reply); this review is partial.");
  expect(readme).toContain("fixes stay on 3 Super");
  expect(readme).toContain("../bench/dev-3.5.md");
});

it("documents partial adapter passes and smoke acceptance", async () => {
  const readme = await readFile(new URL("../../../docs/bench/reviewbench.md", import.meta.url), "utf8");
  expect(readme).toContain("status=ok partial=<failed>/<chunks>");
  expect(readme).toContain("chunks across both reviewers failed");
  expect(readme).toContain("Successful missed chunks are kept when others fail");
  expect(readme).toContain("it accepts both `status=ok` and `status=ok partial=…`");
  expect(readme).not.toContain("Each pass is all or nothing");
});

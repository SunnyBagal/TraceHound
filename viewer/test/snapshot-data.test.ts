import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifySnapshots } from "../scripts/snapshots.mjs";

const SNAPSHOTS = path.resolve(import.meta.dirname, "../../snapshots");

/** A copy of the committed snapshots/ whose index.json a test may rewrite. */
function copy(edit?: (index: Record<string, any>) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-snapshots-"));
  cpSync(SNAPSHOTS, dir, { recursive: true });
  if (edit) {
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));
    edit(index);
    writeFileSync(path.join(dir, "index.json"), JSON.stringify(index));
  }
  return dir;
}

describe("build-time snapshot verification covers every repo, not only `latest`", () => {
  it("accepts the committed index", () => {
    const { manifest } = verifySnapshots(copy());
    expect(manifest.repos!.map((r) => r.id)).toEqual(["cex-v2-boilercode", "recall"]);
  });

  it("accepts `latest` pointing at either repo", () => {
    for (const id of ["recall", "cex-v2-boilercode"]) {
      expect(() => verifySnapshots(copy((i) => (i.latest = i.repos.find((r: { id: string }) => r.id === id).latest)))).not.toThrow();
    }
  });

  it("fails when a repo's latest snapshot is missing, even if `latest` is fine", () => {
    const dir = copy();
    const recall = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")).repos.find((r: { id: string }) => r.id === "recall");
    rmSync(path.join(dir, recall.latest.path));
    expect(() => verifySnapshots(dir, "snap")).toThrow(/snap\/5d2165a.*\/\d+\.\d+\.\d+\.json is missing \(referenced by index\.json as repo recall's latest\)/);
  });

  it("fails when a repo's latest is another repo's snapshot", () => {
    const dir = copy((i) => {
      const cex = i.repos.find((r: { id: string }) => r.id === "cex-v2-boilercode");
      i.repos.find((r: { id: string }) => r.id === "recall").latest.path = cex.latest.path;
    });
    expect(() => verifySnapshots(dir)).toThrow(/lists it as repo recall's latest/);
  });

  it("fails when defaultRepo names no repo", () => {
    expect(() => verifySnapshots(copy((i) => (i.defaultRepo = "nope")))).toThrow(/defaultRepo "nope" is not in repos/);
  });
});

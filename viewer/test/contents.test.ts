import { expect, it } from "vitest";
import { expandedHeight, nodeContents } from "@/lib/contents";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("recall");
it("uses routes, queue edges and processor facts without guessing from names", () => {
  const api = snapshot.components.find((c) => c.kind === "api")!;
  expect(nodeContents(snapshot, { ...api, name: "Database" }).map((i) => [i.method, i.label])).toEqual(api.routes.map((r) => [r.method, r.path]));
  expect(nodeContents(snapshot, snapshot.components.find((c) => c.kind === "queue")!).map((i) => i.detail).sort()).toEqual(["Consumer", "Producer"]);
  expect(nodeContents(snapshot, snapshot.components.find((c) => c.kind === "worker")!)).toEqual([{ label: "processContent", detail: "Processor" }]);
});
it("caps layout height at eight rows plus the inspector link", () => {
  expect(expandedHeight(Array.from({ length: 100 }, () => ({ label: "x" })))).toBe(expandedHeight(Array.from({ length: 9 }, () => ({ label: "x" }))));
});

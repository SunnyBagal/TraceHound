import { beforeEach, describe, expect, it } from "vitest";
import { clearPositions, loadPositions, savePositions } from "@/lib/positions";

describe("saved positions survive a regenerated snapshot", () => {
  beforeEach(() => window.localStorage.clear());

  it("are keyed by repo, not by commit and analyzer version", () => {
    savePositions("SunnyBagal/Recall", { a: { x: 1, y: 2 } });
    expect(loadPositions("SunnyBagal/Recall", "5d2165aa9654f17a148f6663bc478a3fd9f7fc6b")).toEqual({ a: { x: 1, y: 2 } });
    expect(loadPositions("SunnyBagal/cex-v2-boilercode")).toEqual({});
  });

  it("pick up a pre-040 save for the same commit (newest analyzer version)", () => {
    window.localStorage.setItem("tracehound:positions:abc:0.7.0", JSON.stringify({ a: { x: 7, y: 0 } }));
    window.localStorage.setItem("tracehound:positions:abc:0.10.0", JSON.stringify({ a: { x: 10, y: 0 } }));
    window.localStorage.setItem("tracehound:positions:abc:0.9.0", JSON.stringify({ a: { x: 9, y: 0 } }));
    expect(loadPositions("repo", "abc")).toEqual({ a: { x: 10, y: 0 } });
  });

  it("merge new drags into what is saved, and reset really resets", () => {
    window.localStorage.setItem("tracehound:positions:abc:0.9.0", JSON.stringify({ a: { x: 9, y: 0 } }));
    savePositions("repo", { a: { x: 1, y: 1 } });
    savePositions("repo", { b: { x: 2, y: 2 } });
    expect(loadPositions("repo", "abc")).toEqual({ a: { x: 1, y: 1 }, b: { x: 2, y: 2 } });
    clearPositions("repo");
    expect(loadPositions("repo", "abc")).toEqual({}); // not the legacy save
  });
});

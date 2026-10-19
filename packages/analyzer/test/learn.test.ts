import { describe, expect, it } from "vitest";
import { fingerprint, similar, SAME_EXTENSION_JACCARD, SAME_PATH_JACCARD } from "../src/learn/fingerprint.ts";

const finding = { path: "src/profile.ts", line: 20, body: "null dereference of user in getProfile" };
const rephrased = { ...finding, body: "Possible null dereference: user may be undefined in getProfile" };

describe("learning fingerprints", () => {
  it("normalizes paths and keeps a sorted lowercase word set without code, numbers or stop words", () => {
    expect(fingerprint({ path: "./src\\Profile.TS", body: "The NULL null dereference at 123: `user.secret` and ``code here``." }))
      .toEqual({ path: "src/Profile.TS", ext: ".ts", tokens: ["dereference", "null"] });
  });
  it.each([
    ["same defect, same file", rephrased, true],
    ["different defect, same file", { ...finding, body: "SQL injection: name is concatenated into the query in getProfile" }, false],
    ["same defect, different extension", { ...rephrased, path: "src/profile.py" }, false],
    ["same words, same extension", { ...finding, path: "src/other.ts" }, true],
  ])("%s → %s", (_case, candidate, expected) => {
    expect(similar(fingerprint(finding), fingerprint(candidate))).toBe(expected);
  });
  it("uses inclusive named thresholds and treats empty sets/extensions conservatively", () => {
    expect(SAME_PATH_JACCARD).toBe(0.5);
    expect(SAME_EXTENSION_JACCARD).toBe(0.7);
    const a = { path: "a.ts", ext: ".ts", tokens: ["a", "b"] };
    expect(similar(a, { ...a, tokens: ["a"] })).toBe(true);
    expect(similar(a, { ...a, path: "b.ts", tokens: ["a"] })).toBe(false);
    expect(similar({ ...a, tokens: [] }, { ...a, tokens: [] })).toBe(false);
    expect(similar({ ...a, path: "a", ext: "" }, { ...a, path: "b", ext: "" })).toBe(false);
    expect(similar({ ...a, tokens: ["a", "b", "c", "d", "e", "f", "g"] },
      { ...a, path: "b.ts", tokens: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] })).toBe(true);
  });
});


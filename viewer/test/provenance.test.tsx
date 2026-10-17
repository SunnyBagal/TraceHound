import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TopBar } from "@/components/TopBar";
import { commitHref, provenanceLabel } from "@/lib/provenance";
import { repoSnapshot } from "./repo-snapshot";

afterEach(cleanup);

it("labels the analyzed commit using its branch and commit date, linking to the commit", () => {
  const s = repoSnapshot("recall");
  const repo = { ...s.repo, branch: "main", commitDate: "2026-10-14T18:30:00Z", commitSha: "5d2165aa9654f17a148f6663bc478a3fd9f7fc6b" };
  expect(provenanceLabel(repo)).toBe("main @ 5d2165a · 14 Oct 2026");
  render(<TopBar snapshot={{ ...s, repo }} />);
  expect(screen.getByText(provenanceLabel(repo)).closest("a")?.getAttribute("href")).toBe(commitHref(repo));
  expect(screen.queryByRole("button", { name: /Copy commit/ })).toBeNull();
});

it("does not invent a branch or date for older snapshots", () => {
  expect(provenanceLabel({ name: "test", commitSha: "a".repeat(40) })).toBe("commit @ aaaaaaa");
});

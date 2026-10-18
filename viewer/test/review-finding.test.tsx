import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReviewFinding } from "@/components/ReviewFinding";
import type { Finding } from "@/lib/reviews";

const finding: Finding = { id: "42", commentId: 42, path: "src/check.ts", line: 8, startLine: 8, body: "**Validate input** before calling `save`. <script>unsafe</script>", source: "both", outdated: false, original: "return unsafe(value);", suggestion: "return check(value);" };
afterEach(cleanup);
it("renders the real before/after code with a disclosure, footer source and GitHub-only commit link", () => {
  const { container } = render(<ReviewFinding finding={finding} repo="acme/shop" number={3} reviewId={10} />);
  expect(within(screen.getByRole("region", { name: "Original code" })).getByTestId("code-snippet").textContent).toContain("return unsafe(value);");
  expect(within(screen.getByRole("region", { name: "Suggested replacement" })).getByTestId("code-snippet").textContent).toContain("return check(value);");
  expect(screen.getByText("model-generated, not tested")).toBeTruthy();
  expect(screen.getByText("both")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Commit fix on GitHub" }).getAttribute("href")).toBe("https://github.com/acme/shop/pull/3/files#r42");
  expect(screen.getByRole("link", { name: "src/check.ts:8" }).getAttribute("href")).toBe("https://github.com/acme/shop/pull/3#discussion_r42");
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("Validate input").tagName).toBe("STRONG");
});
it("supports deletion suggestions and missing diff context without inventing original code", () => {
  render(<ReviewFinding finding={{ ...finding, original: undefined, suggestion: "", source: undefined }} repo="acme/shop" number={3} reviewId={10} />);
  expect(screen.getByText("Delete the selected lines.")).toBeTruthy();
  expect(screen.getByText(/Original code is unavailable/)).toBeTruthy();
  expect(screen.getByText("Source not recorded")).toBeTruthy();
});
it("offers a discussion link when no fix was posted", () => {
  render(<ReviewFinding finding={{ ...finding, original: undefined, suggestion: undefined }} repo="acme/shop" number={3} reviewId={10} />);
  expect(screen.queryByTestId("fix-diff")).toBeNull();
  expect(screen.queryByRole("link", { name: "Commit fix on GitHub" })).toBeNull();
  expect(screen.getByRole("link", { name: "Open finding on GitHub" })).toBeTruthy();
});

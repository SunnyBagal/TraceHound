import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReviewsDashboard, PullReviewDashboard } from "@/components/ReviewsDashboard";
import { loadPullReview, loadReviewList, ReviewsError, type PullRequest, type TraceReview } from "@/lib/reviews";
vi.mock("@/lib/reviews", async (original) => ({ ...await original<typeof import("@/lib/reviews")>(), loadReviewList: vi.fn(), loadPullReview: vi.fn() }));
const pull: PullRequest = { number: 3, title: "Handle expired sessions", state: "open", merged_at: null, head: { sha: "a".repeat(40) }, updated_at: "2026-10-18" };
const review: TraceReview = { id: 10, footer: { version: 1, pipeline: "pool-verify-v1", headSha: pull.head.sha, pool: 2, kept: 1, posted: 1, fixes: { attempted: 1, valid: 1, rejected: 0 } } };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/reviews"); });
afterEach(cleanup);
it("defaults to the demo repo and shows footer counts, state and a detail link", async () => {
  vi.mocked(loadReviewList).mockResolvedValue({ pulls: [{ pull, review }, { pull: { ...pull, number: 4, title: "Merged work", merged_at: "2026-10-18" } }], rateLimited: false });
  render(<ReviewsDashboard />);
  await screen.findByRole("link", { name: /Handle expired sessions/ });
  expect(loadReviewList).toHaveBeenCalledWith("SunnyBagal/tracehound-demo");
  const row = screen.getByRole("link", { name: /Handle expired sessions/ });
  expect(row.getAttribute("href")).toBe("/reviews/pr?repo=SunnyBagal%2Ftracehound-demo&n=3");
  expect(row.textContent).toContain("1 finding"); expect(row.textContent).toContain("1 suggestion");
  expect(row.textContent).not.toContain("1 findings"); expect(row.textContent).not.toContain("1 suggestions");
  expect(screen.getByRole("link", { name: /Merged work/ }).textContent).toContain("Merged");
  expect(screen.getByRole("link", { name: /Merged work/ }).textContent).toContain("— findings");
});
it("keeps partial rows visible on a quiet rate limit", async () => {
  vi.mocked(loadReviewList).mockResolvedValue({ pulls: [{ pull, unavailable: true }], rateLimited: true });
  render(<ReviewsDashboard />);
  expect((await screen.findByText("GitHub rate limit, try later")).getAttribute("role")).toBe("status");
  expect(screen.getByRole("link", { name: /Handle expired sessions/ })).toBeTruthy();
});
it("handles errors and empty repositories", async () => {
  vi.mocked(loadReviewList).mockRejectedValue(new ReviewsError("GitHub rate limit, try later", true));
  const view = render(<ReviewsDashboard />);
  await screen.findByText("GitHub rate limit, try later"); view.unmount();
  vi.mocked(loadReviewList).mockResolvedValue({ pulls: [], rateLimited: false });
  render(<ReviewsDashboard />); expect(await screen.findByText(/No pull requests found/)).toBeTruthy();
});
it("reads repo and PR query parameters and renders the finding with a real fix diff", async () => {
  window.history.replaceState(null, "", "/reviews/pr?repo=acme/shop&n=3");
  vi.mocked(loadPullReview).mockResolvedValue({ pull, review, findings: [{ id: "42", commentId: 42, path: "src/auth.ts", line: 8, startLine: 8, body: "Check expiration.", original: "decode(token);", suggestion: "verify(token);", source: "both", outdated: false }] });
  render(<PullReviewDashboard />);
  const card = await screen.findByTestId("review-finding");
  expect(loadPullReview).toHaveBeenCalledWith("acme/shop", 3);
  expect(within(card).getByTestId("fix-diff").textContent).toContain("verify(token);");
  expect(screen.getByRole("link", { name: "All reviews" }).getAttribute("href")).toBe("/reviews?repo=acme%2Fshop");
});
it("rejects invalid queries before requests", async () => {
  window.history.replaceState(null, "", "/reviews/pr?repo=acme/shop&n=oops");
  render(<PullReviewDashboard />);
  await screen.findByText("Enter a valid pull request number.");
  expect(loadPullReview).not.toHaveBeenCalled();
});
it("distinguishes no review from a zero-finding review", async () => {
  window.history.replaceState(null, "", "/reviews/pr?n=3");
  vi.mocked(loadPullReview).mockResolvedValue({ pull, findings: [] });
  const view = render(<PullReviewDashboard />);
  await screen.findByText(/No TraceHound review with a data footer/); view.unmount();
  vi.mocked(loadPullReview).mockResolvedValue({ pull, review: { ...review, footer: { ...review.footer, posted: 0 } }, findings: [] });
  render(<PullReviewDashboard />);
  await waitFor(() => expect(screen.getByText(/TraceHound posted no findings/)).toBeTruthy());
});

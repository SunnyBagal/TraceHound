import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PricingPage from "@/app/pricing/page";

afterEach(cleanup);

describe("the standalone pricing page", () => {
  it("uses the shared shell, marks Pricing active and links back to the other pages", () => {
    render(<PricingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Flat pricing for every developer.");
    expect(screen.getByText("TraceHound / Pricing")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["TraceHound", "Graph", "Reviews", "Benchmark", "Pricing"]);
    expect(within(nav).getByRole("link", { name: "Pricing" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe("/pricing");
    expect(within(nav).getByRole("link", { name: "TraceHound home" }).getAttribute("href")).toBe("/");
  });

  it("shows the four plans, both billing rates, all included features and the early-pricing terms", () => {
    render(<PricingPage />);
    const plans = screen.getByRole("region", { name: "Pricing plans" });
    const cards = Array.from(within(plans).getAllByRole("list")[0]!.children) as HTMLElement[];
    expect(cards).toHaveLength(4);
    const expected = [
      ["Open Source", "$0", "Free for public repos", "Public repos", "Unlimited reviews", "Repo graph"],
      ["Pro", "$15", "per dev / month, billed annually", "$19 billed monthly", "Private repos", "Unlimited reviews", "No per-review overage", "Repo graph + PR findings", "One-click GitHub suggestions"],
      ["Team", "$29", "per dev / month, billed annually", "$36 billed monthly", "Everything in Pro", "Multi-repo graph", "Custom review rules", "Priority support"],
      ["Enterprise", "Custom", "Quoted per seat", "Self-hosting", "Bring your own model key", "SSO", "Audit logs"],
    ];
    cards.forEach((card, i) => {
      for (const copy of expected[i]!) expect(within(card).getByText(copy)).toBeTruthy();
    });
    expect(within(cards[1]!).getByText("Most popular")).toBeTruthy();
    expect(within(plans).getAllByText("Most popular")).toHaveLength(1);
    expect(screen.getByText("Early pricing · may change")).toBeTruthy();
    expect(screen.getByText("Flat per-seat price. No credits, no overage bills.")).toBeTruthy();
  });

  it("keeps connect and trial CTAs on the graph and enterprise contact on a GitHub issue", () => {
    render(<PricingPage />);
    const plans = screen.getByRole("region", { name: "Pricing plans" });
    expect(within(plans).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Connect GitHub", "/graph"],
      ["Start free trial", "/graph"],
      ["Start free trial", "/graph"],
      ["Talk to us", "https://github.com/SunnyBagal/TraceHound/issues/new?title=Enterprise%20pricing"],
    ]);
  });
});

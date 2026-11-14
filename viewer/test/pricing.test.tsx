import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";
import { PLANS } from "@/components/landing/Pricing";
import { GRAPH_HREF } from "@/lib/landing";

afterEach(cleanup);

describe("the landing page's pricing section", () => {
  it("sits right above the footer and the nav links to it", () => {
    render(<Home />);
    const section = screen.getByTestId("pricing");
    expect(section.id).toBe("pricing");
    expect(section.nextElementSibling?.tagName).toBe("FOOTER");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Pricing" }).getAttribute("href")).toBe("#pricing");
  });

  it("shows the label, the four plans in order, their CTAs and the line under the cards", () => {
    render(<Home />);
    const section = screen.getByTestId("pricing");
    expect(within(section).getByRole("heading", { level: 2, name: "Pricing" })).toBeTruthy();
    expect(within(section).getByTestId("pricing-label").textContent).toBe("Early pricing · may change");
    expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Open Source", "Pro", "Team", "Enterprise"]);

    const card = (name: string) => section.querySelector(`[data-plan="${name}"]`) as HTMLElement;
    expect(card("Open Source").textContent).toContain("$0");
    expect(card("Pro").textContent).toContain("$15");
    expect(card("Pro").textContent).toContain("billed annually$19 billed monthly");
    expect(card("Pro").textContent).toContain("Most popular");
    expect(card("Team").textContent).toContain("$29");
    expect(card("Team").textContent).toContain("billed annually$36 billed monthly");
    expect(card("Enterprise").textContent).toContain("Custom");
    for (const name of ["Open Source", "Team", "Enterprise"]) expect(card(name).textContent).not.toContain("Most popular");

    expect(within(card("Pro")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Private repos", "Unlimited reviews", "No per-review overage", "Repo graph + PR findings", "One-click GitHub suggestions",
    ]);
    expect(within(card("Team")).getByText("Everything in Pro")).toBeTruthy();
    expect(within(card("Enterprise")).getByText("Bring your own model key")).toBeTruthy();

    const ctas = PLANS.map((p) => within(card(p.name)).getByRole("link"));
    expect(ctas.map((a) => a.textContent)).toEqual(["Connect GitHub", "Start free trial", "Start free trial", "Talk to us"]);
    expect(ctas[0]?.getAttribute("href")).toBe(GRAPH_HREF);
    expect(screen.getByTestId("pricing-note").textContent).toBe("Flat per-seat price. No credits, no overage bills.");
  });

  it("names no other review product", () => {
    render(<Home />);
    const words = screen.getByTestId("pricing").textContent ?? "";
    for (const name of ["CodeRabbit", "Greptile", "Augment", "Cursor", "Copilot", "Graphite", "Qodo", "Sourcery"]) expect(words).not.toMatch(new RegExp(name, "i"));
  });
});

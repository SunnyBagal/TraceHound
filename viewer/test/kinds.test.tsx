import { ComponentKind } from "@tracehound/analyzer/schema";
import { expect, it } from "vitest";
import { KIND_META } from "@/lib/kinds";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KindLegend } from "@/components/KindLegend";
import { repoSnapshot } from "./repo-snapshot";

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}
it("gives every schema kind a unique token, icon and label with AA text contrast", () => {
  for (const kind of ComponentKind.options) {
    const token = KIND_META[kind];
    expect(token.icon).toBeTruthy();
    expect(token.label).toBeTruthy();
    for (const bg of ["#13111b", "#17161f"]) expect((luminance(token.color) + .05) / (luminance(bg) + .05)).toBeGreaterThanOrEqual(4.5);
  }
  expect(new Set(Object.values(KIND_META).map((k) => k.color)).size).toBe(9);
});

it("lists only kinds present, and collapses without losing the labels", () => {
  const components = repoSnapshot("recall").components.filter((c) => c.kind === "api" || c.kind === "worker");
  render(<KindLegend components={components} />);
  const legend = screen.getByTestId("kind-legend");
  expect(legend.hasAttribute("open")).toBe(false);
  fireEvent.click(legend.querySelector("summary")!);
  expect(legend.hasAttribute("open")).toBe(true);
  expect([...legend.querySelectorAll("li")].map((el) => el.dataset.kind)).toEqual([...new Set(components.map((c) => c.kind))]);
  expect(screen.queryByText("Database")).toBeNull();
  cleanup();
});

import type { Metadata } from "next";
import { ReviewShell, ShellHero } from "@/components/ReviewShell";
import { PricingPlans } from "@/components/pricing/PricingPlans";

export const metadata: Metadata = {
  title: "Pricing · TraceHound",
  description: "Flat per-seat pricing for TraceHound. Free for public repos, with Pro, Team and Enterprise plans.",
};

export default function PricingPage() {
  return <ReviewShell active="Pricing">
    <ShellHero kicker="TraceHound / Pricing" title="Flat pricing for every developer." tone="violet">
      <p className="rv-lede">Free for public repos. Per-seat plans for private repos and teams, with unlimited reviews.</p>
    </ShellHero>
    <PricingPlans />
  </ReviewShell>;
}

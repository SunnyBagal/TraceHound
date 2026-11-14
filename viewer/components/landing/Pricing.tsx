import { Check } from "lucide-react";
import { GITHUB_URL, GRAPH_HREF } from "@/lib/landing";

/**
 * The landing page's pricing section (Sunny's brief, 2026-11-15): four per-seat plans, early and subject to change.
 * Nothing here is wired to billing; the CTAs go where the page's other calls to action go (the graph) and
 * "Talk to us" opens a GitHub issue. Cream band, Georgia headings and the hero's 6px buttons, so it reads as the hero's
 * page; widths come from .lp-col like every other landing section. No other product is named on this page.
 */

type Plan = {
  name: string;
  price: string;
  /** under the price: the billing terms, and the month-to-month price on its own line */
  terms: string;
  monthly?: string;
  /** spoken in full for screen readers, since "$15/dev/mo" reads badly */
  spoken: string;
  features: readonly string[];
  cta: { label: string; href: string };
  popular?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    name: "Open Source",
    price: "$0",
    terms: "Free for public repos",
    spoken: "Free",
    features: ["Public repos", "Unlimited reviews", "Repo graph"],
    cta: { label: "Connect GitHub", href: GRAPH_HREF },
  },
  {
    name: "Pro",
    price: "$15",
    terms: "per dev / month, billed annually",
    monthly: "$19 billed monthly",
    spoken: "15 dollars per developer per month, billed annually, or 19 dollars billed monthly",
    features: ["Private repos", "Unlimited reviews", "No per-review overage", "Repo graph + PR findings", "One-click GitHub suggestions"],
    cta: { label: "Start free trial", href: GRAPH_HREF },
    popular: true,
  },
  {
    name: "Team",
    price: "$29",
    terms: "per dev / month, billed annually",
    monthly: "$36 billed monthly",
    spoken: "29 dollars per developer per month, billed annually, or 36 dollars billed monthly",
    features: ["Everything in Pro", "Multi-repo graph", "Custom review rules", "Priority support"],
    cta: { label: "Start free trial", href: GRAPH_HREF },
  },
  {
    name: "Enterprise",
    price: "Custom",
    terms: "Quoted per seat",
    spoken: "Custom pricing, quoted per seat",
    features: ["Self-hosting", "Bring your own model key", "SSO", "Audit logs"],
    cta: { label: "Talk to us", href: `${GITHUB_URL}/issues/new?title=${encodeURIComponent("Enterprise pricing")}` },
  },
] as const;

const serif = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;
const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#465f77]";

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="lp-anchor bg-[#f2e9e1] text-[#252522]" data-testid="pricing">
      <div className="lp-col py-24 sm:py-28">
        <h2 id="pricing-title" className="text-center text-[clamp(36px,4.4vw,56px)] font-normal leading-[1.05] tracking-[-0.03em]" style={serif}>
          Pricing
        </h2>
        <p className="mt-10 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-[#5a5c55]" data-testid="pricing-label">
          Early pricing · may change
        </p>

        <ul role="list" className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              data-plan={plan.name}
              className={`relative flex flex-col rounded-[10px] border p-7 ${
                plan.popular ? "border-[#252522] bg-[#fdfbf8] shadow-[0_20px_48px_rgba(39,42,48,0.12)]" : "border-[rgba(37,37,34,0.14)] bg-[#f8f4ee]"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-7 rounded-full bg-[#252522] px-3 py-1 text-[12px] font-medium leading-none text-[#f8f8f6]">Most popular</span>
              )}
              <h3 className="text-[15px] font-semibold tracking-[-0.005em]">{plan.name}</h3>
              <p className="mt-4">
                <span className="sr-only">{plan.spoken}</span>
                <span aria-hidden className="block text-[44px] leading-none tracking-[-0.03em]" style={serif}>
                  {plan.price}
                </span>
                <span aria-hidden className="mt-2 block min-h-[2.6em] text-[13.5px] leading-snug text-[#4f514b]">
                  {plan.terms}
                  {plan.monthly && <span className="block">{plan.monthly}</span>}
                </span>
              </p>
              <ul role="list" className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-[rgba(37,37,34,0.12)] pt-6 text-[14.5px] leading-snug">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-px size-4 shrink-0 text-[#252522]" strokeWidth={2.25} aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={plan.cta.href}
                className={`mt-8 inline-flex h-11 items-center justify-center rounded-[6px] border border-[#252522] px-5 text-[15px] font-medium transition-colors ${focus} ${
                  plan.popular ? "bg-[#252522] text-[#f8f8f6] hover:bg-[#3e403a]" : "text-[#252522] hover:bg-white"
                }`}
              >
                {plan.cta.label}
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-[15px] text-[#4f514b]" data-testid="pricing-note">
          Flat per-seat price. No credits, no overage bills.
        </p>
      </div>
    </section>
  );
}

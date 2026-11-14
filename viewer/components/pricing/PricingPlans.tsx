import { Check } from "lucide-react";
import { GITHUB_URL, GRAPH_HREF } from "@/lib/landing";

// Plan copy and placeholder destinations from ui-03; billing is not connected.
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

export function PricingPlans() {
  return <section className="pricing" aria-label="Pricing plans">
    <p className="pricing-label">Early pricing · may change</p>
    <ul role="list" className="pricing-grid">
      {PLANS.map((plan) => <li key={plan.name} className="pricing-card" data-popular={plan.popular ? "" : undefined}>
        <div className="pricing-card-head">
          <h2 id={`plan-${plan.name.toLowerCase().replaceAll(" ", "-")}`} className="pricing-name">{plan.name}</h2>
          {plan.popular && <span className="pricing-badge">Most popular</span>}
        </div>
        <p className="pricing-cost">
          <span className="sr-only">{plan.spoken}</span>
          <span aria-hidden className="pricing-price">{plan.price}</span>
          <span aria-hidden className="pricing-terms">
            {plan.terms}
            {plan.monthly && <span className="pricing-monthly">{plan.monthly}</span>}
          </span>
        </p>
        <ul role="list" className="pricing-features">
          {plan.features.map((feature) => <li key={feature}>
            <Check className="pricing-check" strokeWidth={2} aria-hidden />
            <span>{feature}</span>
          </li>)}
        </ul>
        <a href={plan.cta.href} className={`vbtn pricing-cta${plan.popular ? " vbtn-primary" : ""}`}>
          {plan.cta.label}
        </a>
      </li>)}
    </ul>
    <p className="pricing-note">Flat per-seat price. No credits, no overage bills.</p>
  </section>;
}

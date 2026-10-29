import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WOLF_PATH, WOLF_VIEWBOX } from "@/lib/wolf";
import { inter, jetbrains, serif } from "@/components/landing/fonts";
import { BLUR_THIRD_PARTY_MARKS } from "@/lib/marks";

export const metadata: Metadata = {
  title: "TraceHound",
  description: "TraceHound reviews: bugs, suggested fixes and an evidence-backed architecture graph.",
  icons: {
    // the wolf mark alone (no tile): the page colour on light tab bars, silver (--logo) on dark ones
    icon: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WOLF_VIEWBOX}"><style>path{fill:#0e0e13}@media (prefers-color-scheme:dark){path{fill:#dde3ee}}</style><path fill-rule="evenodd" d="${WOLF_PATH}"/></svg>`,
    ),
  },
};

// themeColor is a meta tag and can't read CSS: keep it equal to --page-bg in globals.css.
// viewportFit "cover" makes env(safe-area-inset-*) real, for the phone warnings button.
export const viewport: Viewport = { themeColor: "#0e0e13", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrains.variable} ${serif.variable}`} data-blur-marks={BLUR_THIRD_PARTY_MARKS ? "" : undefined}>
      <body>{children}</body>
    </html>
  );
}

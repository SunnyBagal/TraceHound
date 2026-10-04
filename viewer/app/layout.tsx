import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WOLF_PATH, WOLF_VIEWBOX } from "@/components/Logo";

export const metadata: Metadata = {
  title: "TraceHound",
  description: "Evidence-backed architecture graph: every edge points back to a file, line and extractor.",
  icons: {
    // the wolf mark alone (no tile): navy on light tab bars, silver (--logo) on dark ones
    icon: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WOLF_VIEWBOX}"><style>path{fill:#0b1120}@media (prefers-color-scheme:dark){path{fill:#dde3ee}}</style><path fill-rule="evenodd" d="${WOLF_PATH}"/></svg>`,
    ),
  },
};

// themeColor is a meta tag and can't read CSS: keep it equal to --canvas-bg in globals.css.
// viewportFit "cover" makes env(safe-area-inset-*) real, for the phone warnings button.
export const viewport: Viewport = { themeColor: "#0b1120", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

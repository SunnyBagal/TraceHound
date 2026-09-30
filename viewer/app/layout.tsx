import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceHound",
  description: "Evidence-backed architecture graph: every edge points back to a file, line and extractor.",
  icons: {
    icon: "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0a0a0c"/><circle cx="5" cy="18" r="1.6" fill="#f5a524" opacity=".4"/><circle cx="9" cy="14.5" r="1.8" fill="#f5a524" opacity=".65"/><circle cx="12.5" cy="11.5" r="2" fill="#f5a524"/><rect x="14.5" y="3.5" width="6.5" height="6.5" rx="1.8" fill="none" stroke="#f5a524" stroke-width="1.8"/></svg>',
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

import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time by next/font: the browser never requests Google (CREDITS.md).
// Inter and JetBrains Mono are the whole app's (app/layout.tsx); Instrument Serif is the hero's.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
export const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

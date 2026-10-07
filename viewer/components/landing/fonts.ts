import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time by next/font: the browser never requests Google (CREDITS.md).
// Only the landing page uses them; the viewer keeps its own stack.
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

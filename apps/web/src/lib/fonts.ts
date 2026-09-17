import { Big_Shoulders, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

/**
 * Gate 9R Part 4 — three deliberate typography roles, replacing the
 * previous all-default-sans treatment. Self-hosted via `next/font` (no
 * runtime request to Google Fonts, no layout shift, no external network
 * dependency at page-view time).
 */
export const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

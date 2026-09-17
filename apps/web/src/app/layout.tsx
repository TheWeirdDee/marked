import type { Metadata } from "next";
import { display, body, mono } from "@/lib/fonts";
import { LenisProvider } from "@/components/motion/LenisProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Marked — Governance isn't finished when it passes",
    template: "%s · Marked",
  },
  description:
    "Deterministic governance fulfillment for Cactus-indexed DAOs, executed by KeeperHub, verified by Marked.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--accent-strong)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black"
        >
          Skip to content
        </a>
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}

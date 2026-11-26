import type { Metadata } from "next";
import { Inter, Space_Grotesk, Work_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-label",
  display: "swap",
});

const FAVICON_SVG_URI =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90' fill='%230a7c6e'>%E2%82%BF</text></svg>";

export const metadata: Metadata = {
  title: "BTC Strategy Lab",
  description:
    "Bitcoin backtesting simulator powered by on-chain indicator analysis. Test, validate, and explore Bitcoin timing strategies using 1.29M optimization trials and 14 years of on-chain data with zero lookahead bias.",
  icons: {
    icon: FAVICON_SVG_URI,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${workSans.variable} ${inter.variable}`}
    >
      <body className="min-h-screen bg-[#fff8f1] text-[#213448] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

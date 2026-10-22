import type { Metadata } from "next";
import { Literata, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import "@/styles/reading-mode.css";
import "@/styles/sermon-marks.css";

const literata = Literata({
  subsets: ["latin", "latin-ext"],
  variable: "--font-literata",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sermon Editor / Presenter",
  description:
    "Dual-shell sermon app — Editing Mode (TipTap) and Preaching Mode (reading stage)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${literata.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}

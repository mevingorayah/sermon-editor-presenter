import type { Metadata } from "next";
import { Literata, Source_Serif_4 } from "next/font/google";
import { GOOGLE_FONTS_HREF } from "@/lib/writing/fontCatalog";
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_HREF} rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";
import "@/styles/reading-mode.css";
import "@/styles/sermon-marks.css";

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
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}

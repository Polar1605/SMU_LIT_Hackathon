import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AITHENA",
  description: "Contract obligations, anchored to verified evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Anek_Tamil, Cormorant_Garamond, Source_Serif_4 } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const anekTamil = Anek_Tamil({
  variable: "--font-anek-tamil",
  subsets: ["tamil"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://anekaroopam.art"),
  title: {
    default: "Anekaroopam",
    template: "%s — Anekaroopam",
  },
  description:
    "A visual philosophy of multistable figurative emergence. An archival perceptual orientation framework.",
  openGraph: {
    siteName: "Anekaroopam",
    locale: "en_US",
    type: "website",
    images: [
      { url: BRAND.markLight, width: 1200, height: 1200, alt: "Anekaroopam" },
    ],
  },
  icons: {
    icon: [
      { url: BRAND.favicon, sizes: "any" },
      { url: BRAND.svg, type: "image/svg+xml" },
    ],
    apple: BRAND.markLight,
    shortcut: BRAND.favicon,
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
      className={`${cormorant.variable} ${sourceSerif.variable} ${anekTamil.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}

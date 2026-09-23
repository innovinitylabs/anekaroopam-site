import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Anek_Tamil, Cormorant_Garamond, Source_Serif_4 } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const siteDescription =
  "Anekaroopam is a visual philosophy and perceptual archive focused on multistable figurative emergence through rotational perception and the Valiroopam process.";

const socialImage = "/opengraph-image";

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
  description: siteDescription,
  applicationName: "Anekaroopam",
  creator: "Valipokkann",
  publisher: "Anekaroopam",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Anekaroopam",
    description: siteDescription,
    url: "/",
    siteName: "Anekaroopam",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "Valiroopam artwork showing figurative emergence through rotational perception",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Anekaroopam",
    description: siteDescription,
    images: [socialImage],
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
      <body className="flex min-h-full flex-col antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

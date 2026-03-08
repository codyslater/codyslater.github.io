import type { Metadata } from "next";
import Script from "next/script";
import { mono } from "@/lib/fonts";
import { siteConfig } from "@/lib/constants";
import { NavBar } from "@/components/layout/NavBar";
import { AnimatedFavicon } from "@/components/ui/AnimatedFavicon";

import "./globals.css";

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} font-mono antialiased`}>
        <AnimatedFavicon />
        <NavBar />
        <main>{children}</main>
        <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "028b62932c3a415697d884bff0bc75dc"}'
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

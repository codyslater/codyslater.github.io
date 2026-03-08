import type { Metadata } from "next";
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
      </body>
    </html>
  );
}

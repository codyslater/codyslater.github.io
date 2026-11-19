import type { Metadata } from "next";
import { AboutContent } from "@/components/sections/AboutContent";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "about",
  description: "MD student and PhD candidate working where biological and machine intelligence meet.",
  path: "/about/",
});

export default function AboutPage() {
  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <AboutContent />
    </div>
  );
}

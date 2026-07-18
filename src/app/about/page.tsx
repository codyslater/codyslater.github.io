import type { Metadata } from "next";
import { AboutContent } from "@/components/sections/AboutContent";

export const metadata: Metadata = { title: "about" };

export default function AboutPage() {
  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <AboutContent />
    </div>
  );
}

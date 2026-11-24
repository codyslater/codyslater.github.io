import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundPath } from "@/components/layout/NotFoundPath";

// no canonical: the layout default would name /_not-found/
export const metadata: Metadata = { title: "404", alternates: { canonical: null } };

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center font-mono px-4">
      <div className="text-center space-y-4">
        <h1 className="space-y-4">
          <span className="block text-secondary">
            <span className="text-accent-green">$</span> cd <NotFoundPath />
          </span>
          <span className="block text-accent-pink text-balance">
            bash: cd: <NotFoundPath />: No such file or directory
          </span>
        </h1>
        <p className="text-muted text-sm mt-8">
          <Link href="/?skip=1" className="text-accent-green glow-hover hover:underline">
            ~ cd home
          </Link>
        </p>
      </div>
    </div>
  );
}

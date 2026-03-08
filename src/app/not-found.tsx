import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center font-mono">
      <div className="text-center space-y-4">
        <p className="text-secondary">
          <span className="text-accent-green">$</span> cd /page
        </p>
        <p className="text-accent-pink">
          bash: cd: /page: No such file or directory
        </p>
        <p className="text-muted text-sm mt-8">
          <Link href="/" className="text-accent-green glow-hover hover:underline">
            ~ cd home
          </Link>
        </p>
      </div>
    </div>
  );
}

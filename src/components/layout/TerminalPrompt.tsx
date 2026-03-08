"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/lib/constants";

export function TerminalPrompt() {
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const cmd = input.trim().toLowerCase();
      setInput("");

      if (!cmd) return;

      // Handle "cd <path>" style commands
      const cdMatch = cmd.match(/^cd\s+(.+)$/);
      const target = cdMatch ? cdMatch[1].replace(/^\//, "") : cmd;

      const route = siteConfig.terminalCommands[target];

      if (route === null) {
        // Special command like "help"
        setFeedback("commands: about, projects, home, cd <page>");
        setTimeout(() => setFeedback(null), 3000);
        return;
      }

      if (route) {
        router.push(route);
        return;
      }

      setFeedback(`bash: ${cmd}: command not found`);
      setTimeout(() => setFeedback(null), 3000);
    },
    [input, router],
  );

  // Focus on click
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Focus terminal on "/" key if not already focused on an input
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-sm bg-background/60 border-t border-border/30">
      <div className="max-w-5xl mx-auto px-6 py-3 font-mono text-sm">
        {feedback && (
          <div className="text-accent-pink text-xs mb-1">{feedback}</div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="text-accent-green select-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent text-foreground outline-none caret-accent-green placeholder:text-muted"
            placeholder='type "help" for commands'
            spellCheck={false}
            autoComplete="off"
          />
        </form>
      </div>
    </div>
  );
}

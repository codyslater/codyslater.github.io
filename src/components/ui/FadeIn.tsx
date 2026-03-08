"use client";

import { motion } from "framer-motion";

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "down" | "none";
}

export function FadeIn({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: FadeInProps) {
  const y = direction === "up" ? 16 : direction === "down" ? -16 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

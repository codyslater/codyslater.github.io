import { Newsreader } from "next/font/google";

// Only the literary routes (writing, projects) import this module, so every other
// route skips the serif's preload. Keep it out of the root layout.
export const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

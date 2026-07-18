export type NavItem = {
  label: string;
  href: string;
  icon: string;
  color?: string;
  external?: boolean;
};

// The single source of truth for navigation. Consumed by NavBar, NavGrid,
// and CyclingTagline (terminal autocomplete).
const nav: NavItem[] = [
  { label: "about", href: "/about", icon: "~", color: "#39ff14" },
  { label: "projects", href: "/projects", icon: "/>" },
  {
    label: "publications",
    href: "https://scholar.google.com/citations?user=2iMWaGAAAAAJ&hl=en",
    icon: "[]",
    external: true,
  },
  { label: "writing", href: "/writing", icon: ">>" },
];

export const siteConfig = {
  name: "Cody Slater",
  title: "cody_slater",
  description:
    "MD/PhD. engineer. scientist. Building at the intersection of RNA, neural computation, synthetic biology, and AI.",
  url: "https://codyslater.github.io",
  bio: "working on ideas that bridge organic and machine intelligence. where RNA, neural computation, synthetic biology, and AI converge.",
  links: {
    github: "https://github.com/codyslater",
    bluesky: "https://bsky.app/profile/codyslater.bsky.social",
    substack: "https://copyingourselves.substack.com",
    cv: "#",
  },
  nav,
  interests: [
    { label: "rna", color: "#ff2d78" },
    { label: "neural computation & control", color: "#39ff14" },
    { label: "synthetic biology", color: "#bf5af2" },
    { label: "organic-machine interfaces", color: "#00e5ff" },
    { label: "ai", color: "#ff6a00" },
  ],
};

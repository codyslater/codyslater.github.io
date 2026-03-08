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
  nav: [
    { label: "about", href: "/about" },
    { label: "projects", href: "/projects" },
    // { label: "publications", href: "/publications" },
    // { label: "writing", href: "/blog" },
  ],
  interests: [
    { label: "rna", color: "#ff2d78" },
    { label: "neural computation & control", color: "#39ff14" },
    { label: "synthetic biology", color: "#bf5af2" },
    { label: "organic-machine interfaces", color: "#00e5ff" },
    { label: "ai", color: "#ff6a00" },
  ],
  terminalCommands: {
    about: "/about",
    projects: "/projects",
    home: "/",
    help: null, // handled specially
  } as Record<string, string | null>,
};

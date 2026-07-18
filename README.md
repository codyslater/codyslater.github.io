# codyslater.github.io

Personal website built with Next.js 16, deployed to GitHub Pages.

## Features

- **Interactive graph canvas** landing page with typing animation
- **Procedurally generated pixel creatures** — deterministic via seeded PRNG, with build-up assembly and melt/scatter animations
- **Cycling tagline** with terminal-style interactivity (click to type, Tab to autocomplete navigation)
- Framer Motion transitions throughout
- Static export for GitHub Pages hosting
- **MDX content layer** — posts in `content/writing/`, projects in `content/projects/`; publishing = add a file and push. Frontmatter is validated at build time. Posts support code highlighting (Shiki), math (KaTeX), and embedded interactive React components (registered in `src/components/mdx/index.ts`). Drafts (`draft: true`) render in dev only. RSS feed, sitemap, and robots are generated from the same content at build time.

## Tech Stack

- Next.js 16 (App Router, static export)
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- JetBrains Mono font

## Development

```bash
npm install
npm run dev
```

## Adding content

- **Post:** copy `content/writing/2026-07-09-hello-world.mdx`, set real frontmatter (`title`, `date` as "YYYY-MM-DD", `summary`), remove `draft: true` when ready, push. Images go in `public/` and are referenced by absolute path (e.g. `/logo.png`).
- **Project:** add a file to `content/projects/` with `title`, `summary`, optional `tags`/`links` (github/paper/demo) and `order`.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow at `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages.

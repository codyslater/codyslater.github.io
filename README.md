# codyslater.github.io

Personal website built with Next.js 16, deployed to GitHub Pages.

## Features

- **Interactive graph canvas** landing page with typing animation
- **Procedurally generated pixel creatures** — deterministic via seeded PRNG, with build-up assembly and melt/scatter animations
- **Cycling tagline** with terminal-style interactivity (click to type, Tab to autocomplete navigation)
- Framer Motion transitions throughout
- Static export for GitHub Pages hosting

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

## Deployment

Pushes to `main` trigger the GitHub Actions workflow at `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages.

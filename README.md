# codyslater.github.io

Personal website built with Next.js 16, deployed to GitHub Pages.

## Features

- **Opening screen** — the name types over a circuit board that becomes a living graph, then hands over to a nav screen. It plays on every arrival and reload; the site's own links back to home add `?skip=1` to the URL, which goes straight to the nav screen.
- **Nav screen** — a cycling tagline with terminal-style interactivity (click to type, Tab to autocomplete navigation) above a row of section icons, and a small pixel creature standing on the name. A tap startles it, a drag picks it up and can throw it, and a double tap opens it in `/soup`.
- **Procedurally generated pixel creatures** — deterministic via seeded PRNG, with a range of birth and ending animations. `/zoo` is an unlisted page that shows a set of specimens.
- **Interactive graph** at `/graph`.
- **MDX content layer** — posts in `content/writing/`, projects in `content/projects/`; publishing = add a file and push. Frontmatter is validated at build time. Posts support code highlighting (Shiki), math (KaTeX), and embedded interactive React components (registered in `src/components/mdx/index.ts`). Drafts (`draft: true`) render in dev only. RSS feed, sitemap, and robots are generated from the same content at build time.
- **Reading mode** — the writing and project pages use a serif face (Newsreader, `src/lib/fonts-serif.ts`) and can switch between a dark and a paper-colored theme.
- Static export for GitHub Pages hosting.

## Tech Stack

- Next.js 16 (App Router, static export)
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion (one control on the opening screen; the other transitions are CSS)
- JetBrains Mono (site-wide) and Newsreader (writing and project pages)

## Development

```bash
npm install
npm run dev
```

Opening the nav screen with `?debug=1` in the URL turns on a measurement hook for the creature stage (`window.__creature`); its parameters are listed in `src/components/creature/debug.ts`.

## Scripts

- `npm run build` — static export to `out/`. It first runs `scripts/check-contact.mjs` (`prebuild`), which checks that the contact component's encoded address is well-formed and never prints it.
- `npm run lint` — ESLint.
- `npm run test:publications` — run after a build: checks that `out/publications/` lists every entry in the CV's "Publications & Papers" section.
- `npm run cv:pdf` — renders `content/cv.yaml` to `public/cv/cody-slater-cv.pdf` with RenderCV, in a local `.venv` created on first run (pinned in `scripts/cv-requirements.txt`).
- `python3 scripts/make-og-images.py` — writes a 1200x630 `og.jpg` share card beside each cover under `public/writing/` and `public/projects/`. Needs Pillow.

## Adding content

- **Post:** add an `.mdx` file to `content/writing/` with frontmatter `title`, `date` ("YYYY-MM-DD") and `summary`, optional `tags`, and `draft: true` while it is unfinished; remove `draft: true` when ready, push. For work in progress, write it in the git-ignored `content/drafts/` instead (shown by `npm run dev`, never built for production, never reaches the public repo) and move it to `content/writing/` to publish; `draft: true` in `content/writing/` still works for a post you are fine having in the public repo. Images go in `public/` and are referenced by absolute path (e.g. `/logo.png`). Optional frontmatter: `updated` ("YYYY-MM-DD", not earlier than `date`) shows an "updated" date, and `cover` (an absolute image path, kept under `public/writing/<slug>/`) renders above the title and is used as the social preview image.
- **Project:** add a file to `content/projects/` with `title`, `summary`, optional `tags`/`links` (github/paper/demo) and `order`.

## Deployment

Pushes to `main` trigger the GitHub Actions workflow at `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages.

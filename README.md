# Claude216.github.io

Personal site for Lunxiao (Claude) Li, live at **https://claude216.github.io**.

## Layout

The repository holds source only — there is no built HTML checked in.

```
portfolio-v2/          the Next.js app (the whole site)
  src/app/             routes: / , /out-of-work , /metronome
  src/components/      Navbar, Hero, Education, Publications, Experience, Contact, Metronome
  src/lib/             metronome domain logic (pure, unit tested)
  src/data/            profile / education / experience / publications content
  public/              static assets served at the site root
  test/                node:test unit tests
.github/workflows/     build + deploy workflow
```

## How it deploys

Pages is configured with **Source: GitHub Actions**. On every push to `main`,
`.github/workflows/deploy.yml`:

1. installs dependencies (`npm ci`) in `portfolio-v2`,
2. runs `npm run lint` and `npm test`,
3. runs `npm run build`, which statically exports the site to `portfolio-v2/out`,
4. publishes that directory as the Pages artifact.

The `out/` directory and `.next/` are gitignored — they are build products.

`next.config.mjs` sets `output: 'export'`, so the site is plain static files:
no server, no runtime image optimisation (`images.unoptimized`). Any Next.js
feature that needs a server (route handlers, ISR, middleware) will not work
here.

## Local development

```bash
cd portfolio-v2
npm install
npm run dev      # http://localhost:3000
npm run lint
npm test         # metronome domain logic
npm run build    # writes the deployable ./out directory
```

To inspect exactly what would be published:

```bash
cd portfolio-v2 && npm run build && cd out && python3 -m http.server 8000
```

## Editing content

Most text lives in `portfolio-v2/src/data/*.json` — profile, education,
experience and publications. Sections read those files at build time, so a
change there needs a rebuild (i.e. a push) rather than a code edit.

## Notes

- The site was previously a set of hand-written static files at the repository
  root (`index.html`, `shared.css`, `metronome.html`, …). It has been fully
  replaced by `portfolio-v2`; the old files remain in git history.
- `environment.yml` is an unused conda environment spec left over from that
  older setup.

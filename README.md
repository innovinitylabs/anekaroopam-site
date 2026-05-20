# Anekaroopam

A contemplative digital art platform for multistable figurative emergence — archival, rotational, and participatory.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site.

The **Orientation System** (Perception Engine) lives at `/perceive` locally, or `perceive.anekaroopam.art` in production (subdomain rewrite via `src/middleware.ts`).

## Structure

```
src/
  app/
    (site)/          Public website pages
    perceive/        Configurational interface
  components/
    perception/      Perception Engine UI
    site/            Museum-like site chrome
  lib/
    perception/      Core engine (types, rotation, export)
    content/         Archive data and writings
```

## Perception Engine

- Import high-resolution artwork
- Define perceptual states (angle, name, caption)
- Snap-to-state or free rotation
- Export standalone offline HTML (base64 image, embedded behavior)
- Export JSON configuration for future integrations

## Deployment

Deploy to Vercel with:

- Primary domain: `anekaroopam.art`
- Subdomain: `perceive.anekaroopam.art` → same project (middleware handles routing)

## License

Private / all rights reserved unless otherwise specified.

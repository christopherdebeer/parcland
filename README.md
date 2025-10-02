# 🌲 parc.land

Interactive canvas-based diagramming application created with **websim.ai**.

## Monorepo Structure

This project is structured as a monorepo with two packages:

- **vite-app/** - Vite static site (deployed to GitHub Pages)
- **next-api/** - Next.js API server (deployed to Vercel with Turso database)

## Development

### Vite Static Site
```bash
npm run dev:vite
```

### Next.js API Server
```bash
npm run dev:next
```

## Deployment

### GitHub Pages (Vite Static Site)
The Vite application automatically deploys to GitHub Pages on push to `main` branch via GitHub Actions.

### Vercel (Next.js API)
The Next.js API is configured for Vercel deployment via `vercel.json`.

**Required Environment Variables in Vercel:**
- `SQLITE_DB_TURSO_DATABASE_URL` - Your Turso database URL
- `SQLITE_DB_TURSO_AUTH_TOKEN` - Your Turso auth token

## Migrating from val.town to Vercel API

The Vite app can be configured to use the Vercel-hosted API instead of val.town:

1. Deploy the Next.js API to Vercel
2. Update API endpoint in `vite-app/src/lib/network/storage.ts`
3. Change `https://backpack.parc.land` to your Vercel URL

## Original Backend

Originally used **val.town** backend:
- https://www.val.town/v/c15r/parcland_backpack
- https://www.val.town/v/c15r/replicate_base

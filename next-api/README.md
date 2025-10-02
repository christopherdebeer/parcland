# Parcland API (Next.js)

Next.js API server with Turso SQLite database integration for Parcland.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in Vercel:
   - `SQLITE_DB_TURSO_DATABASE_URL` - Your Turso database URL
   - `SQLITE_DB_TURSO_AUTH_TOKEN` - Your Turso auth token

## Development

```bash
npm run dev
```

The API will be available at http://localhost:3000

## API Endpoints

### Storage API

**GET** `/api/storage/{namespace}/{id}`
- Load canvas data from database
- Headers: `Authorization: Bearer <token>`
- Response: Canvas data JSON

**PUT** `/api/storage/{namespace}/{id}`
- Save canvas data to database
- Headers:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- Body: Canvas data JSON
- Response: Success confirmation

## Deployment

This API is designed to be deployed to Vercel. The `vercel.json` in the root configures the deployment.

### Environment Variables (Vercel)

Configure these in your Vercel project settings:
- `SQLITE_DB_TURSO_DATABASE_URL`
- `SQLITE_DB_TURSO_AUTH_TOKEN`

## Database Schema

```sql
CREATE TABLE canvas_data (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (namespace, id)
);

CREATE INDEX idx_canvas_updated ON canvas_data(updated_at);
```

The database is automatically initialized on first request.

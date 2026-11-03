# Kebab Guide — Backend & Admin Panel

A production-style REST backend for a kebab shop guide app, plus a server-rendered
admin panel for content moderation (validating shops and user ratings).

- **Runtime:** Node.js + TypeScript (strict mode)
- **Framework:** Express 4
- **Database:** PostgreSQL via TypeORM (hand-written SQL migrations)
- **Admin panel:** server-rendered EJS with session auth (PostgreSQL-backed store), CSRF protection and bcrypt password hashing
- **Validation:** class-validator DTOs on every write path + database CHECK constraints
- **Tooling:** ESLint (typescript-eslint), Prettier, Vitest, helmet, morgan, express-rate-limit

## Project structure

```
src/                          Backend (Node.js + TypeScript)
  server.ts                   Entry point (graceful shutdown, DB retry)
  app.ts                      Express app factory (security headers, sessions, routes)
  config/env.ts               Zod-validated environment configuration
  api/v1.router.ts            Composition root of the public /api/v1 router
  database/
    data-source.ts            TypeORM data source (snake_case naming strategy)
    entities/                 Shop, Rating, AdminUser entities (one class per file)
    migrations/               SQL migrations (tables, indexes, CHECK constraints)
    naming-strategy.ts        camelCase property -> snake_case column mapping
    migrate.ts / seed.ts      Migration CLI and idempotent seed script
    dev-db.ts                 Dev-only embedded PostgreSQL helper (no Docker needed)
  middleware/                 Errors, validation, uploads, rate limiting
  utils/                      Shared helpers & models (one type per file):
                              AppError, pagination, uuid checks, uploaded photo, ...
  modules/                    Features (package-by-feature)
    shop/                     Shop service, mapper, routes + dto/ (requests/responses)
    rating/                   Rating service, controller, mapper + dto/
    mobileapp/                Mobile app API (/mobileapp/v1), mapper + dto/
    admin/                    Admin panel backend: auth, CSRF, controllers + helpers
    health/                   GET /health
frontend/                     Admin panel UI (served by the backend)
  views/                      EJS templates (layout partials, lists, forms)
  public/                     Admin stylesheet + tiny confirm-delete script
tests/unit/                   Vitest unit tests (DTOs, services, utils)
scripts/e2e-smoke.mjs         End-to-end smoke test against a running server
```

## Getting started

### 1. Configure

```bash
cp .env.example .env
```

Defaults work out of the box for local development (DB `postgres://kebab:kebab@localhost:5432/kebab_guide`,
admin `admin@kebab.guide` / `admin12345`). **Change `SESSION_SECRET`, `ADMIN_EMAIL`
and `ADMIN_PASSWORD` before deploying.**

### 2. Provide PostgreSQL (pick one)

```bash
# Option A: Docker
docker compose up -d          # starts postgres:16 on :5432

# Option B: embedded (no Docker / no local Postgres needed, dev only)
npm run db:start              # downloads real PG binaries into ./data/pg
npm run db:stop               # stop it again
npm run db:clean              # wipe the data directory
```

### 3. Migrate & seed

```bash
npm run migration:run         # or rely on RUN_MIGRATIONS_ON_START=true
npm run seed                  # creates the admin user + sample shops/ratings
```

### 4. Run
```bash
npm run db:start
npm run dev                   # tsx watch (development)
npm run build && npm start    # production build -> dist/
```

- API: http://localhost:3000/api/v1
- Admin panel: http://localhost:3000/admin
- Health: http://localhost:3000/health

## Scripts

| Command                 | Description                                   |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Development server with watch/reload          |
| `npm run build`         | Compile to `dist/`                            |
| `npm start`             | Run the compiled build                        |
| `npm test`              | Unit tests (Vitest)                           |
| `npm run lint`          | ESLint                                        |
| `npm run typecheck`     | Strict TypeScript check                       |
| `npm run e2e`           | E2E smoke test (server must be running)       |
| `npm run migration:run` | Apply pending migrations                      |
| `npm run migration:revert` | Revert the last migration                  |
| `npm run seed`          | Create admin user (+ sample data, idempotent) |
| `npm run db:start`      | Start embedded dev PostgreSQL                 |

## Public API

Base URL: `/api/v1`. All responses are JSON (`{ data }` on success,
`{ error: { code, message, details? } }` on failure). Photos are stored as
`bytea` blobs and served through dedicated photo endpoints with ETag caching.

### Shops

| Method | Path                       | Description                                                        |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| POST   | `/api/v1/shops`            | Create a shop. JSON or `multipart/form-data` with optional `photo`. |
| GET    | `/api/v1/shops`            | List shops (see query params below).                                |
| GET    | `/api/v1/shops/:id`        | Shop details.                                                       |
| GET    | `/api/v1/shops/:id/photo`  | Shop photo bytes (404 when absent).                                 |
| POST   | `/api/v1/shops/:id/ratings`| Submit a rating for a shop (always created as **pending**).         |
| GET    | `/api/v1/shops/:id/ratings`| Validated ratings of a shop (paginated).                            |

`POST /api/v1/shops` body:

```json
{
  "name": "Kebab King",          // required, <= 255 chars
  "latitude": 52.52,             // required, -90..90
  "longitude": 13.405            // required, -180..180
}
```

`GET /api/v1/shops` query params:

- `page`, `limit` (default 20, max 100)
- `isValidated` — `true`/`false` filter
- `search` — case-insensitive name search
- `lat`, `lng`, `radiusKm` — great-circle distance filter; each result then
  includes `distanceKm`, sorted nearest first

### Ratings

`POST /api/v1/shops/:shopId/ratings` body:

```json
{
  "foodQualityRating": 5,        // required, integer 1..5
  "priceFairRating": 4,          // required, integer 1..5
  "interiorRating": 4,           // required, integer 1..5
  "notes": "Generous portions"   // optional, <= 2000 chars
}
```

Multipart requests may include an optional `photo` image file (max 5 MB).

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/v1/ratings/:id`         | Rating details (includes `overallRating`). |
| GET    | `/api/v1/ratings/:id/photo`   | Rating photo bytes.                  |

### Validation workflow (moderation)

1. Shops and ratings created through the API are stored with `is_validated = false`.
2. An admin opens **/admin**, reviews pending items and clicks **Validate**.
3. When a rating is validated (or un-validated / edited / deleted), the parent
   shop's `rating` (average of the three subscores over validated ratings) and
   `count_of_rates` are recomputed automatically.
4. The public ratings list of a shop only exposes **validated** ratings.

## Admin panel

Server-rendered at `/admin`:

- **Login** — email + password (bcrypt), session cookie (`httpOnly`, `sameSite=lax`,
  PostgreSQL-backed store), session regeneration on login, login rate limiting.
- **Dashboard** — totals + pending counts, latest pending ratings with one-click validation.
- **Shops** — searchable/filterable list, create, edit (name, geo, photo, validated flag),
  validate/unvalidate, delete (cascades ratings).
- **Ratings** — filter by status/shop, create (any shop, any initial status),
  edit scores/notes/photo, validate/unvalidate, delete. Every mutation
  recomputes the parent shop aggregates.

All state-changing forms are CSRF-protected; destructive actions ask for
confirmation in the browser.

## Database schema

- **shop_table** — `id` (uuid PK), `name`, `latitude` (CHECK -90..90),
  `longitude` (CHECK -180..180), `rating` (numeric(3,2) — average of validated
  ratings), `count_of_rates`, `photo` (bytea), `photo_mime_type`,
  `is_validated` (bool), timestamps. Index on `is_validated`.
- **rating_table** — `id`, `shop_id` (FK -> shop_table ON DELETE CASCADE),
  `food_quality_rating` / `price_fair_rating` / `interior_rating`
  (smallint CHECK 1..5), `notes`, `photo`, `photo_mime_type`, `is_validated`,
  timestamps. Indexes on `shop_id` and `is_validated`.
- **admin_user** — `id`, unique `email`, `password_hash`.
- **admin_session** — express-session store table.

## Security notes

- Helmet security headers + CSP, JSON escaping, `x-powered-by` disabled.
- Parameterised queries everywhere (no string-built SQL with user input);
  LIKE searches escape `%`/`_`/`\`.
- Strict DTO validation with unknown-property stripping on every write.
- Uploads limited to images, size-capped, held in memory only.
- Rate limits: public write endpoints (configurable) and admin login attempts.
- Production guard refuses to boot with the default `SESSION_SECRET`.

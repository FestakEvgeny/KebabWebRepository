# Kebab Guide — Backend & Admin Panel

A production-style REST backend for a kebab shop guide app, plus a server-rendered
admin panel for content moderation (validating shops and user ratings).

- **Runtime:** Node.js + TypeScript (strict mode)
- **Framework:** Express 4
- **Database:** PostgreSQL via TypeORM (hand-written SQL migrations)
- **Admin panel:** server-rendered EJS with session auth (PostgreSQL-backed store), CSRF protection and bcrypt password hashing
- **Validation:** class-validator DTOs on every write path + database CHECK constraints
- **Tooling:** ESLint (typescript-eslint), Prettier, Vitest, helmet, morgan, express-rate-limit

## Project structure (modular monolith)

```
src/                              Backend (Node.js + TypeScript)
  server.ts                       Entry point (graceful shutdown, DB retry)
  app.module.ts                   Root of the DI graph (imports every Nest module)
  app.ts                          Composition root: boots the DI container
                                  (Nest standalone context), mounts routers
  api/                            Public API composition
    v1.router.ts                  Mounts oauth/shop/rating under /api/v1 and
                                  the bearer auth gate
  shared/                         SHARED KERNEL (may never import modules/)
    config/env.ts                 Zod-validated environment configuration
    middleware/                   Errors, validation, uploads, rate limiting
    types/                        Ambient type declarations
    utils/                        Shared helpers (AppError, pagination,
                                  photo handling, crypto, string utils, ...)
  modules/                        Business modules (self-contained features,
                                  Nest DI wiring in <name>.module.ts)
    shop/                         Shop entity + service + HTTP layer, the
                                  ShopRatingsReader port, dto/ + index.ts
    rating/                       Rating entity + service (owns the shop
                                  aggregate recompute), ShopGateway port,
                                  HTTP controller, dto/ + index.ts
    oauth/                        User/AuthToken entities, token service
                                  (access + refresh pairs), register/login/
                                  logout, bearer auth middleware, index.ts
    admin/                        Admin panel (the ONLY place with login/
                                  moderation): AdminUser entity, session auth,
                                  CSRF, view mappers, controllers, index.ts
    health/                       GET /health
  database/                       Infrastructure: data-source.ts (assembles
                                  module entity registries + migrations globs),
                                  database.module.ts (DI provider),
                                  naming-strategy.ts, migrate.ts / seed.ts /
                                  dev-db.ts, migrations/
frontend/                         Admin panel UI (served by the backend)
  views/                          EJS templates (layout partials, lists, forms)
  public/                         Admin stylesheet + tiny confirm-delete script
tests/unit/                       Vitest unit tests (DTOs, services, utils)
scripts/e2e-smoke.mjs             End-to-end smoke test against a running server
```

### Module boundaries

Each module in `src/modules/<name>/` is self-contained: it owns its entities,
service, HTTP layer and its database schema (entity classes + future
migrations in `modules/<name>/migrations/`, assembled by `database/data-source.ts`).
The rest of the app may only use a module through its **public API**
(`src/modules/<name>/index.ts`), which exposes its Nest module class
(`<Name>Module`), its service(s), DI tokens, entities and port types.
Internals are not importable from other modules — keep imports on the
public API only (by convention, not lint-enforced).

Dependency injection uses the NestJS IoC container
(`@nestjs/common` + `@nestjs/core`): services and controllers are
`@Injectable()`, each module wires its providers (including its Express
router) in `<name>.module.ts`, and `app.ts` boots the container with
`NestFactory.createApplicationContext` and mounts the routers it resolves.

Allowed dependency directions:

```
composition (app.ts, server.ts, api/, database/)  ->  any module public API
modules                                           ->  shared/
rating                                            ->  shop (public API only)
admin                                             ->  shop + rating (public API only)
shop (Nest wiring in shop.module.ts only)         ->  rating (public API only)
oauth, health                                     ->  (no module dependencies)
shared                                            ->  (nothing module-related)
```

Cross-module data access goes through consumer-owned ports, wired by the DI
container:

- **rating → shop** (`ShopGateway`): rating asks the shop module whether a
  shop exists and pushes the recomputed rating aggregates
  (`applyRatingAggregates`) onto the shop row. The rating module owns the
  rating data and computes the averages; the shop module only stores them.
- **shop → ratings** (`ShopRatingsReader`): the shop detail response embeds
  validated ratings via this port, implemented by the rating module. The two
  ports together keep the *services* one-way (rating → shop); on the DI
  graph level the two modules form a `forwardRef` pair
  (`ShopModule` ⇄ `RatingModule`): `RatingModule` publishes the
  `SHOP_RATINGS_READER` provider (an adapter over its service) and
  `RatingService` receives the shop module's `ShopService` as its gateway.

Modules reference each other by ID only: `Rating` stores a plain `shopId`
column (the `ON DELETE CASCADE` foreign key lives in the SQL migration), and
there are no cross-module TypeORM relations.

### Layering rules (who is allowed to see what)

- **Services** return domain entities (plus pagination) — they know nothing
  about JSON shapes.
- **Public API** (`/api/v1`, consumed by the Android app): mappers in
  `shop.mapper.ts` / `rating.mapper.ts` produce responses *without* the
  moderation flag, and all public listings only ever include **validated**
  content. Anyone may submit shops/ratings — they are stored as pending.
- **Admin panel** (`/admin`, session + CSRF protected): `admin.mapper.ts`
  produces view models *with* `isValidated`, and the admin controllers see
  pending content. Login, validate/unvalidate and delete exist **only** here —
  the public API has no admin operations at all.

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

### 5. if Already running:
```bash
npm run build
npm start  
```
Or if doesn't work - just rebuild with 
netstat -ano | findstr :3000    # note the PID in the last column
taskkill /F /PID <that_pid>

rerun database:
npm run db:clean → db:start → migration:run → npm run seed

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

**Every `/api/v1` endpoint requires a valid access token** sent as
`Authorization: Bearer <accessToken>` — except the token endpoints themselves
(see below). Requests without a token get `401 UNAUTHORIZED`; requests with an
unknown or expired access token get `401 INVALID_ACCESS_TOKEN`.

Public responses never contain the moderation flag `isValidated`, and public
listings only ever include **validated** content — pending items are visible
to admins (in `/admin`) and, for the submit-then-view flow, when fetched
directly by their unguessable UUID id.

### OAuth tokens & accounts

| Method | Path                       | Description                                                                        |
| ------ | -------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/oauth/token`      | Issue a new anonymous access + refresh token pair (no auth required).              |
| POST   | `/api/v1/oauth/token`      | Exchange a refresh token for a new access token.                                    |
| POST   | `/api/v1/oauth/register`   | Create a user account (`email` + `password`; JSON or form-urlencoded).             |
| POST   | `/api/v1/oauth/login`      | Verify credentials, issue a user-bound token pair (`application/x-www-form-urlencoded`). |
| POST   | `/api/v1/oauth/logout`     | Delete the token pair behind the `Authorization: Bearer <accessToken>` header.     |

Token lifetimes are configurable: `ACCESS_TOKEN_TTL_SECONDS` (default 86400 =
1 day) and `REFRESH_TOKEN_TTL_SECONDS` (default 2592000 = 30 days). Both
tokens are random 256-bit values, globally unique in the `auth_table` table.

Every token pair carries `isAuthorized`: `false` for anonymous pairs, `true`
for pairs issued by a successful login (those rows also reference the
`user_table` record).

The flow:

1. `GET /api/v1/oauth/token` returns a fresh pair (HTTP 201):

   ```json
   {
     "data": {
       "accessToken": "6f9c…",
       "refreshToken": "3b1a…",
       "tokenType": "Bearer",
       "expiresIn": 86400,
       "accessExpiresAt": "2026-11-07T12:00:00.000Z",
       "refreshExpiresAt": "2026-12-06T12:00:00.000Z",
       "isAuthorized": false
     }
   }
   ```

2. Call any other `/api/v1` endpoint with `Authorization: Bearer <accessToken>`.

3. Once the access token expired (401 `INVALID_ACCESS_TOKEN`), refresh it:

   `POST /api/v1/oauth/token` with body `{ "refreshToken": "…" }` — returns a
   **new access token** while keeping the same refresh token (the refresh
   token and its expiry are never changed; `isAuthorized` is preserved).

4. When the refresh token has expired too, the same POST deletes the whole
   `auth_table` record and returns **400** `REFRESH_TOKEN_EXPIRED` (an unknown
   refresh token returns 400 `INVALID_REFRESH_TOKEN`). The client must start
   over with GET.

Account lifecycle:

1. `POST /api/v1/oauth/register` stores the user (email is normalized to
   lowercase, password kept only as a bcrypt hash) and returns 201 with
   `{ "data": { "id", "email", "createdAt" } }` — no tokens. A duplicate
   email returns **409** `EMAIL_ALREADY_REGISTERED`.

2. `POST /api/v1/oauth/login` with `application/x-www-form-urlencoded`
   `email` + `password` returns **201** with a fresh token pair whose
   `isAuthorized` is `true` and whose `auth_table` row references the user.
   Unknown email or wrong password → **401** `INVALID_CREDENTIALS` (flat
   response time, failed attempts are rate limited).

3. `POST /api/v1/oauth/logout` with `Authorization: Bearer <accessToken>`
   deletes that `auth_table` record → **204**; afterwards the access token
   stops working and further calls return 401. Logging out with an unknown
   token returns **401** `INVALID_ACCESS_TOKEN`.

### Shops

| Method | Path                       | Description                                                        |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| POST   | `/api/v1/shops`            | Submit a shop (stored **pending**). JSON or `multipart/form-data` with optional `photo`. |
| GET    | `/api/v1/shops`            | List **validated** shops (see query params below).                  |
| GET    | `/api/v1/shops/all`        | Every **validated** shop in one response, no pagination.            |
| GET    | `/api/v1/shops/:id`        | Shop detail, includes `ratingsList` (validated ratings, newest first). |
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

1. Shops and ratings created through the public API are stored with
   `is_validated = false` and are invisible in all public listings.
2. An admin opens **/admin** (admin session required), reviews pending items
   and clicks **Validate**. Validation endpoints exist *only* in the admin
   panel, protected by session + CSRF.
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
- **user_table** — app accounts created via `/oauth/register`: `id`, unique
  `email` (stored lowercase), `password_hash` (bcrypt), timestamps.
- **admin_session** — express-session store table.
- **auth_table** — issued OAuth token pairs: `id`, globally unique
  `access_token` and `refresh_token`, `access_token_expires_at`,
  `refresh_token_expires_at`, `is_authorized` (true only for pairs issued by
  a successful login), `user_id` (FK -> user_table ON DELETE CASCADE, null
  for anonymous pairs), timestamps. An expired refresh token deletes the
  whole row (enforced by the refresh endpoint), as does a logout.

## Security notes

- Helmet security headers + CSP, JSON escaping, `x-powered-by` disabled.
- Parameterised queries everywhere (no string-built SQL with user input);
  LIKE searches escape `%`/`_`/`\`.
- Strict DTO validation with unknown-property stripping on every write.
- Public API authenticated with opaque 256-bit random bearer tokens; unique
  constraints in `auth_table` guarantee no two clients share a token.
- App passwords are only stored as bcrypt hashes (cost 12); login uses a
  constant dummy hash to keep response times flat for unknown emails and is
  rate limited on failed attempts.
- Uploads limited to images, size-capped, held in memory only.
- Rate limits: public write endpoints + token endpoints (configurable),
  public API login attempts and admin login attempts.
- Production guard refuses to boot with the default `SESSION_SECRET`.

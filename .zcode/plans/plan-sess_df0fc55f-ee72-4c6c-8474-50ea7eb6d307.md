# Modular Monolith Refactor — kebab_guide

The API contract (URLs, JSON shapes), DB schema, and behavior stay identical. This is a structural refactor: modules become self-contained (entity + logic + HTTP + public API), cross-module access goes through explicit, lint-enforced boundaries.

## Target structure

```
src/
├── server.ts, app.ts              # composition root — wires modules, may import any module's index.ts
├── api/                           # public API composition (v1.router, deps)
├── shared/                        # SHARED KERNEL — may never import modules/
│   ├── config/env.ts
│   ├── middleware/                # async-handler, validate, error/not-found/send-error, photo-upload, 3 rate limiters
│   ├── types/                     # express-session.d.ts, embedded-postgres.d.ts
│   └── utils/                     # error/, math/, pagination/, photo/, string/, transform/ (unchanged)
├── modules/
│   ├── shop/      index.ts, shop.entity.ts, shop.service.ts, shop.controller.ts, shop.routes.ts,
│   │              shop.mapper.ts, shop-rating-reader.ts (port + summary type), shop-list-*, dto/
│   ├── rating/    index.ts, rating.entity.ts, rating.service.ts, rating.controller.ts, rating.mapper.ts,
│   │              shop-gateway.ts (port), list-*, dto/
│   ├── oauth/     index.ts, user.entity.ts, auth-token.entity.ts, oauth.{service,controller,routes,mapper}.ts,
│   │              authenticate.ts (moved from middleware), express-auth.d.ts (moved from types), dto/
│   ├── admin/     index.ts, admin-user.entity.ts, admin-auth.service.ts (new), admin.routes.ts, 3 controllers,
│   │              csrf, flash, render-admin, require-admin, mappers, helpers, dashboard-stats.ts (new)
│   └── health/    index.ts, health.routes.ts
├── database/                      # infrastructure only: data-source.ts (aggregates module entities),
│   │                              # naming-strategy, migrate.ts, seed.ts, dev-db.ts, migrations/
└── frontend/                      # unchanged (admin EJS views + static assets)
```

## Boundary rules (enforced by eslint-plugin-boundaries, documented in README)

1. Cross-module imports may only target the module's `index.ts` (its public API).
2. Allowed module directions: `rating → shop`, `admin → shop + rating`, `oauth → (none)`, `shop → (none)`, `health → (none)`. No cycles.
3. `shared/` imports nothing from `modules/`; modules/composition may import `shared/` freely.
4. `app.ts`, `api/`, `database/` tooling = composition layer, may use any module public API.
5. Each module owns its entities; `database/` only assembles the TypeORM DataSource and keeps historical migrations (new migrations would live in `modules/<m>/migrations/` — glob extended).

## Implementation steps

### 1. Consolidate shared kernel
- Move `config/`, `middleware/` (EXCEPT `authenticate.ts`), `utils/`, `types/` (EXCEPT `express-auth.d.ts`) → `src/shared/...`. Rewrite imports everywhere (mechanical).
- `middleware/authenticate.ts` → `modules/oauth/authenticate.ts`; `types/express-auth.d.ts` → `modules/oauth/`. This removes the middleware→feature dependency.

### 2. Entities move into their modules; drop cross-module ORM relations
- `shop.entity.ts` → `modules/shop/`; `rating.entity.ts` → `modules/rating/`; `user.entity.ts` + `auth-token.entity.ts` → `modules/oauth/`; `admin-user.entity.ts` → `modules/admin/`. Delete `src/database/entities/`.
- **Decouple entities**: `Rating` loses `@ManyToOne shop` (keeps plain `shopId` uuid column — the DB FK with ON DELETE CASCADE stays in the migration); `Shop` loses `@OneToMany ratings` and the `ratings!` property. Modules reference each other by ID only.
- `data-source.ts`: `entities = [...shopEntities, ...ratingEntities, ...oauthEntities, ...adminEntities]` imported from module index files; migrations glob extended with `src/modules/*/migrations/*.ts` (existing 3 migrations stay put — rewriting executed migrations would break the migrations history table).
- `RatingService.listAdmin`: replace relation join `leftJoin('rating.shop','shop')` with a raw-table join `leftJoin('shop_table','shop','shop.id = rating.shopId')` (search by shop name still works; verified by tests/e2e).

### 3. Shop module — define ports, stop touching rating data
- New `shop-rating-reader.ts`: `ShopRatingSummary` (fields identical to today's `RatingResponse` minus admin-only `shopName`) and port `interface ShopRatingsReader { listValidatedByShop(id): Promise<ShopRatingSummary[]> }`.
- `ShopService(ds, ratingsReader: ShopRatingsReader)`; `getByIdWithRatings` returns `{ shop, ratings }` via the port (no more `Rating` repo access). `shop-detail-response.dto.ratingsList: ShopRatingSummary[]` — same JSON as today.
- New public API methods (used by rating module): `exists(id): Promise<boolean>` and `applyRatingAggregates(shopId, rating: string|null, count: number)` (the `UPDATE shop_table SET rating/count_of_rates...` SQL).
- Remove `recomputeAggregates` and the rating half of `stats()` — `stats()` now returns `{ totalShops, pendingShops }` only.
- `shop.routes.ts` no longer imports/mounts RatingController (that mount moves to composition, step 8).

### 4. Rating module — one-way dependency on shop, owns its aggregate
- New `shop-gateway.ts` (consumer-owned port): `interface ShopGateway { exists(id): Promise<boolean>; applyRatingAggregates(shopId, rating, count): Promise<void> }`.
- `RatingService(ds, shopGateway: ShopGateway)`: existence checks via gateway (no `Shop` repo). New private `recomputeAggregate(shopId)`: SELECT AVG/COUNT over validated ratings (the SQL that used to live in ShopService) then `shopGateway.applyRatingAggregates(...)`. Called after `createAsAdmin` (when validated), `update`, `setValidated`, and `remove` (remove now fetches first). Admin controllers can no longer forget it.
- New `listValidatedSummaries(shopId): Promise<ShopRatingSummary[]>` (maps via existing `toRatingResponse`) — implements the shop port (imported from shop's public API; direction rating→shop is allowed).
- New `stats(): { totalRatings, pendingRatings }`.

### 5. OAuth module
- Entities, service, controller, routes, mapper, dto move in; `authenticate.ts` + `express-auth.d.ts` live here. Public API: entities, `OAuthService`, `OAuthController`, `createOAuthRouter`, `createAuthenticate`.

### 6. Admin module
- `admin-user.entity.ts` moves in. New `admin-auth.service.ts`: `verifyCredentials(email, password)` (bcrypt + DUMMY_HASH moves out of routes) and `ensureAdminUser(email, password)` (for seed). `admin.routes.ts` no longer touches `DataSource`; `AdminRouterDeps` drops `dataSource`.
- Controllers drop all `shops.recomputeAggregates(...)` calls (now internal to RatingService).
- Dashboard stats composed here: new `DashboardStats = shopStats + ratingStats` type; `dashboard.controller` calls both public APIs. Result identical to today's `ShopStats` JSON.

### 7. Health module
- `index.ts` re-exporting `createHealthRouter`.

### 8. Composition — module factories + wiring
- Each module `index.ts` exports `create<Name>Module(...)` returning `{ service, controller, router(s), api }`, plus entity registry and port/public types. Internals stay unexported (lint-enforced).
- `app.ts` wires (resolves the shop↔rating circular-at-boot with a lazy closure, the standard DI pattern):
  ```ts
  let rating: RatingModule;
  const shop = createShopModule(ds, { ratingsReader: (id) => rating.ratingsReader.listValidatedByShop(id) });
  rating = createRatingModule(ds, { shopGateway: shop.api });
  const oauth = createOauthModule(ds);
  const admin = createAdminModule(ds, { shopService: shop.service, ratingService: rating.service });
  ```
- `v1.router.ts`: mounts oauth router, then `createAuthenticate(oauth.service)`, then shop router; the nested `router.use('/shops/:shopId/ratings', ratingController.nestedRouter)` and `/ratings` rootRouter move HERE (composition may wire cross-module routes). `api-v1-deps.ts` updated to module types.
- Session/helmet/CORS/static config stays in `app.ts` (app-level infra).

### 9. `database/seed.ts` — dogfood the public APIs
`ensureAdminUser` (admin), `shopService.create` + `setValidated` (photos via `UploadedPhoto`), `ratingService.createAsAdmin` (validated ones recompute automatically). No direct repo access.

### 10. Tests, lint, docs
- Update `tests/unit/*` imports; `rating.service.test` mocks the gateway (`{ exists, applyRatingAggregates }`); `shop.service.test` passes a stub reader; `authenticate.test` imports from oauth module. No new test logic required; behavior unchanged.
- Add `eslint-plugin-boundaries` (devDep) to flat config: element types `shared` / `composition` (app.ts, server.ts, api/**, database/**) / `module` (src/modules/*, mode full); rules: element-types direction table, entry-point "cross-module only via index.ts", shared→modules disallowed. `npm run lint` must pass clean.
- README: replace "Project structure"/"Layering rules" with the new tree + "Module boundaries" rules (directions, public API via index.ts, module-owned schema, where new migrations go).

## Verification
1. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` — all green.
2. E2E contract check: start dev DB (`npm run db:start`), `npm run migration:run`, `npm run seed`, run server, `npm run e2e` (551-line smoke: oauth flow, shop/rating submission with photo, admin login + CSRF, moderation, aggregate recomputation) — proves the API/HTML contract survived the refactor.

## Explicitly unchanged
DB schema & migrations, all HTTP endpoints/JSON shapes, `frontend/` views, `docker-compose.yml`, vitest setup, `.env` contract.

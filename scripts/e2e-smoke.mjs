/**
 * End-to-end smoke test against a running server (default http://localhost:3000).
 * Exercises the public API (OAuth bearer-token flow, shop/rating submission,
 * photo upload/serving), the admin login flow (session + CSRF) and the rating
 * validation workflow including shop aggregate recomputation.
 *
 *   node scripts/e2e-smoke.mjs [baseUrl]
 */
const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000';

// Unique token per run so repeated runs on a dirty database stay unambiguous.
const RUN = Date.now().toString(36);
const PHOTO_SHOP_NAME = `E2E ${RUN} Photo Shop`;
const PLAIN_SHOP_NAME = `E2E ${RUN} Plain Shop`;

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.error(`  FAIL  ${name} ${extra}`);
  }
}

// Minimal cookie jar
const cookies = new Map();
function cookieHeader() {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}
function storeCookies(response) {
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  for (const entry of setCookies) {
    const [pair] = entry.split(';');
    const equalsIndex = pair.indexOf('=');
    cookies.set(pair.slice(0, equalsIndex), pair.slice(equalsIndex + 1));
  }
}

// Bearer access token for /api/v1 (obtained from GET /api/v1/oauth/token below).
let accessToken;

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookies.size > 0 && !options.noCookies) headers.cookie = cookieHeader();
  // Every /api/v1 route except the token endpoints requires a Bearer access token.
  if (accessToken && path.startsWith('/api/v1') && !path.startsWith('/api/v1/oauth')) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  storeCookies(response);
  return response;
}

function extractCsrfToken(html) {
  const match = /name="_csrf" value="([0-9a-f]+)"/.exec(html);
  return match ? match[1] : null;
}

async function readJson(response) {
  return response.json();
}

async function main() {
  console.log(`Running e2e smoke test against ${BASE_URL}\n`);

  // ---------- Public API ----------
  console.log('Health & infrastructure');
  {
    const health = await request('/health');
    const body = await readJson(health);
    check('GET /health returns 200 with database up', health.status === 200 && body.database === 'up');
  }

  console.log('\nOAuth token flow (public API)');
  let refreshToken;
  {
    const unauthenticated = await request('/api/v1/shops');
    check(
      'GET /api/v1/shops without a Bearer token returns 401 UNAUTHORIZED',
      unauthenticated.status === 401,
    );

    const issued = await request('/api/v1/oauth/token');
    const issuedBody = await readJson(issued);
    accessToken = issuedBody?.data?.accessToken;
    refreshToken = issuedBody?.data?.refreshToken;
    check(
      'GET /api/v1/oauth/token returns 201 with a unique token pair',
      issued.status === 201 &&
        typeof accessToken === 'string' &&
        accessToken.length > 0 &&
        typeof refreshToken === 'string' &&
        refreshToken !== accessToken,
    );

    const refreshed = await request('/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshedBody = await readJson(refreshed);
    check(
      'POST /api/v1/oauth/token rotates the access token and reuses the refresh token',
      refreshed.status === 200 &&
        refreshedBody.data.accessToken !== accessToken &&
        refreshedBody.data.refreshToken === refreshToken,
    );
    accessToken = refreshedBody.data.accessToken;

    const unknownRefresh = await request('/api/v1/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'not-a-real-refresh-token' }),
    });
    check(
      'POST /api/v1/oauth/token with an unknown refresh token returns 400',
      unknownRefresh.status === 400,
    );

    const staleToken = await fetch(`${BASE_URL}/api/v1/shops`, {
      headers: { authorization: `Bearer ${'0'.repeat(64)}` },
    });
    check(
      'GET /api/v1/shops with an invalid token returns 401 INVALID_ACCESS_TOKEN',
      staleToken.status === 401,
    );

    const anonymousBody = await readJson(await request('/api/v1/oauth/token'));
    check(
      'anonymous GET /api/v1/oauth/token pairs report isAuthorized=false',
      anonymousBody.data.isAuthorized === false,
    );
  }

  console.log('\nRegister / login / logout (public API)');
  {
    const email = `e2e-${RUN}@example.com`;
    const registerBody = JSON.stringify({ email, password: 'e2e-password-123' });

    const invalidRegister = await request('/api/v1/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'e2e-password-123' }),
    });
    check(
      'POST /api/v1/oauth/register with a malformed email returns 400 VALIDATION_ERROR',
      invalidRegister.status === 400 &&
        (await readJson(invalidRegister)).error.code === 'VALIDATION_ERROR',
    );

    const registered = await request('/api/v1/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: registerBody,
    });
    const registeredData = (await readJson(registered))?.data;
    check(
      'POST /api/v1/oauth/register returns 201 with the user but no password and no tokens',
      registered.status === 201 &&
        registeredData?.email === email &&
        !('password' in registeredData) &&
        !('passwordHash' in registeredData) &&
        !('accessToken' in registeredData),
    );

    const duplicate = await request('/api/v1/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: registerBody,
    });
    check(
      'registering the same email again returns 409 EMAIL_ALREADY_REGISTERED',
      duplicate.status === 409 &&
        (await readJson(duplicate)).error.code === 'EMAIL_ALREADY_REGISTERED',
    );

    const form = new URLSearchParams({ email, password: 'wrong-password' }).toString();
    const badLogin = await request('/api/v1/oauth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    check(
      'POST /api/v1/oauth/login with a wrong password returns 401 INVALID_CREDENTIALS',
      badLogin.status === 401 &&
        (await readJson(badLogin)).error.code === 'INVALID_CREDENTIALS',
    );

    const login = await request('/api/v1/oauth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password: 'e2e-password-123' }).toString(),
    });
    const loginBody = await readJson(login);
    const loginAccess = loginBody?.data?.accessToken;
    check(
      'POST /api/v1/oauth/login (x-www-form-urlencoded) returns 201 with an authorized pair',
      login.status === 201 &&
        typeof loginAccess === 'string' &&
        loginBody.data.isAuthorized === true,
    );

    const withLoginToken = await fetch(`${BASE_URL}/api/v1/shops`, {
      headers: { authorization: `Bearer ${loginAccess}` },
    });
    check('the login access token works on protected endpoints', withLoginToken.status === 200);

    const logoutWithoutToken = await fetch(`${BASE_URL}/api/v1/oauth/logout`, { method: 'POST' });
    check('POST /api/v1/oauth/logout without a Bearer token returns 401', logoutWithoutToken.status === 401);

    const logout = await fetch(`${BASE_URL}/api/v1/oauth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginAccess}` },
    });
    check('POST /api/v1/oauth/logout deletes the session record (204)', logout.status === 204);

    const afterLogout = await fetch(`${BASE_URL}/api/v1/shops`, {
      headers: { authorization: `Bearer ${loginAccess}` },
    });
    check('the revoked access token no longer works (401)', afterLogout.status === 401);

    const logoutAgain = await fetch(`${BASE_URL}/api/v1/oauth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginAccess}` },
    });
    check('logging out twice returns 401 (record already deleted)', logoutAgain.status === 401);
  }

  console.log('\nShop creation (public API)');
  let shopWithPhotoId;
  let plainShopId;
  {
    const invalid = await request('/api/v1/shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', latitude: 999, longitude: 0 }),
    });
    const body = await readJson(invalid);
    check(
      'POST /api/v1/shops with latitude 999 returns 400 VALIDATION_ERROR',
      invalid.status === 400 && body.error.code === 'VALIDATION_ERROR',
    );

    const form = new FormData();
    form.set('name', PHOTO_SHOP_NAME);
    form.set('latitude', '52.52');
    form.set('longitude', '13.405');
    form.set('photo', new Blob([PNG_BYTES], { type: 'image/png' }), 'shop.png');
    const created = await request('/api/v1/shops', { method: 'POST', body: form });
    const createdBody = await readJson(created);
    shopWithPhotoId = createdBody?.data?.id;
    check(
      'POST /api/v1/shops (multipart with photo) returns 201, no moderation flag',
      created.status === 201 &&
        createdBody.data.hasPhoto === true &&
        typeof shopWithPhotoId === 'string' &&
        !('isValidated' in createdBody.data),
    );

    const plain = await request('/api/v1/shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: PLAIN_SHOP_NAME, latitude: 52.53, longitude: 13.42 }),
    });
    const plainBody = await readJson(plain);
    plainShopId = plainBody?.data?.id;
    check('POST /api/v1/shops (JSON) returns 201', plain.status === 201 && typeof plainShopId === 'string');
  }

  console.log('\nModeration privacy (public listings hide pending shops)');
  {
    const list = await readJson(await request(`/api/v1/shops?search=${encodeURIComponent(PHOTO_SHOP_NAME)}`));
    check(
      'GET /api/v1/shops does not list pending shops',
      Array.isArray(list.data) && list.data.length === 0,
    );

    const all = await readJson(await request('/api/v1/shops/all'));
    check(
      'GET /api/v1/shops/all hides pending shops and the moderation flag',
      Array.isArray(all.data) &&
        all.data.every((shop) => !('isValidated' in shop)) &&
        !all.data.some((shop) => shop.id === plainShopId || shop.id === shopWithPhotoId),
    );

    const detail = await readJson(await request(`/api/v1/shops/${plainShopId}`));
    check(
      'GET /api/v1/shops/:id returns a shop by id (submit-then-view works) with ratingsList',
      detail.data.id === plainShopId && Array.isArray(detail.data.ratingsList),
    );
  }

  console.log('\nShop photo endpoints');
  {
    const photo = await request(`/api/v1/shops/${shopWithPhotoId}/photo`);
    const bytes = Buffer.from(await photo.arrayBuffer());
    check(
      'GET shop photo returns the stored PNG bytes',
      photo.status === 200 &&
        photo.headers.get('content-type') === 'image/png' &&
        bytes.length === PNG_BYTES.length,
    );

    const missing = await request(`/api/v1/shops/${plainShopId}/photo`);
    check('GET photo for a shop without one returns 404', missing.status === 404);
  }

  console.log('\nRatings (public API)');
  let ratingId;
  {
    const invalid = await request(`/api/v1/shops/${plainShopId}/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ foodQualityRating: 5, priceFairRating: 4, interiorRating: 6 }),
    });
    const invalidBody = await readJson(invalid);
    check(
      'POST rating with interior 6 returns 400 VALIDATION_ERROR',
      invalid.status === 400 && invalidBody.error.code === 'VALIDATION_ERROR',
    );

    const created = await request(`/api/v1/shops/${plainShopId}/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ foodQualityRating: 5, priceFairRating: 4, interiorRating: 4, notes: 'Solid kebab' }),
    });
    const body = await readJson(created);
    ratingId = body?.data?.id;
    check(
      'POST rating returns 201 pending rating with overall 4.33',
      created.status === 201 && body.data.overallRating === 4.33 && !('isValidated' in body.data),
    );

    const shopNow = await readJson(await request(`/api/v1/shops/${plainShopId}`));
    check(
      'shop aggregates stay null until a rating is validated',
      shopNow.data.rating === null && shopNow.data.countOfRates === null,
    );

    const publicRatings = await readJson(
      await request(`/api/v1/shops/${plainShopId}/ratings`),
    );
    check(
      'public rating list hides pending ratings',
      publicRatings.data.length === 0,
    );

    const missingShop = await request(
      '/api/v1/shops/00000000-0000-0000-0000-000000000000/ratings',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ foodQualityRating: 1, priceFairRating: 1, interiorRating: 1 }),
      },
    );
    check('POST rating for a missing shop returns 404', missingShop.status === 404);
  }

  console.log('\nRetired mobile routes are gone');
  {
    const gone = await request('/mobileapp/v1/allShops');
    check('GET /mobileapp/v1/allShops returns 404 (router removed)', gone.status === 404);

    const allShops = await readJson(await request('/api/v1/shops/all'));
    check(
      'GET /api/v1/shops/all is the mobile catalogue: validated only, no pagination, no isValidated',
      Array.isArray(allShops.data) &&
        allShops.pagination === undefined &&
        allShops.data.every((shop) => !('isValidated' in shop)) &&
        !allShops.data.some((shop) => shop.id === plainShopId || shop.id === shopWithPhotoId),
    );

    const getSingle = await readJson(await request(`/api/v1/shops/${plainShopId}`));
    check(
      'GET /api/v1/shops/:id is the single-shop endpoint with ratingsList',
      getSingle.data.id === plainShopId && Array.isArray(getSingle.data.ratingsList),
    );
  }

  // ---------- Admin panel ----------
  console.log('\nAdmin panel');
  let csrfToken;
  {
    const unauthorized = await request('/admin', { redirect: 'manual' });
    check('GET /admin without a session redirects to login', unauthorized.status === 302);

    const loginPage = await request('/admin/login');
    const loginHtml = await loginPage.text();
    csrfToken = extractCsrfToken(loginHtml);
    check('GET /admin/login renders with a CSRF token', loginPage.status === 200 && !!csrfToken);

    const badLogin = await request('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        _csrf: csrfToken,
        email: 'admin@kebab.guide',
        password: 'wrong-password',
      }).toString(),
    });
    check('login with a wrong password is rejected (302 back to login)', badLogin.status === 401 || badLogin.status === 302);
  }

  {
    // Real login
    const loginPage = await request('/admin/login');
    csrfToken = extractCsrfToken(await loginPage.text());
    const login = await request('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        _csrf: csrfToken,
        email: process.env.ADMIN_EMAIL ?? 'admin@kebab.guide',
        password: process.env.ADMIN_PASSWORD ?? 'admin12345',
      }).toString(),
    });
    check('login with correct credentials redirects to /admin', login.status === 302);

    const dashboard = await request('/admin');
    const dashboardHtml = await dashboard.text();
    csrfToken = extractCsrfToken(dashboardHtml) ?? csrfToken;
    check(
      'dashboard renders with stats',
      dashboard.status === 200 && dashboardHtml.includes('Dashboard') && dashboardHtml.includes('Ratings pending'),
    );

    const shopsPage = await request('/admin/shops?status=pending');
    const shopsHtml = await shopsPage.text();
    check(
      'admin shops list shows pending shops with actions',
      shopsPage.status === 200 && shopsHtml.includes(PHOTO_SHOP_NAME) && shopsHtml.includes('Validate'),
    );

    const noCsrf = await request(`/admin/ratings/${ratingId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'redirectTo=/admin',
    });
    check('POST without CSRF token is rejected with 403', noCsrf.status === 403);

    const validate = await request(`/admin/ratings/${ratingId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfToken, redirectTo: '/admin/ratings' }).toString(),
    });
    check('admin validates the rating (302 redirect)', validate.status === 302);

    const shopAfter = await readJson(await request(`/api/v1/shops/${plainShopId}`));
    check(
      'shop rating recomputed to 4.33 with count 1 after validation',
      shopAfter.data.rating === 4.33 && shopAfter.data.countOfRates === 1,
    );

    const publicRatings = await readJson(
      await request(`/api/v1/shops/${plainShopId}/ratings`),
    );
    check(
      'validated rating is now visible on the public endpoint',
      publicRatings.data.length === 1 && publicRatings.data[0].id === ratingId,
    );

    const detailWithRatings = await readJson(await request(`/api/v1/shops/${plainShopId}`));
    check(
      'shop detail includes the validated rating in ratingsList',
      detailWithRatings.data.ratingsList.some((rating) => rating.id === ratingId),
    );

    const ratingDetail = await readJson(await request(`/api/v1/ratings/${ratingId}`));
    check('GET /api/v1/ratings/:id returns the validated rating', ratingDetail.data.id === ratingId);

    const validateShop = await request(`/admin/shops/${shopWithPhotoId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfToken, redirectTo: '/admin/shops' }).toString(),
    });
    check('admin validates the shop (302 redirect)', validateShop.status === 302);

    const validatedList = await readJson(
      await request(`/api/v1/shops?search=${encodeURIComponent(`E2E ${RUN}`)}`),
    );
    check(
      'validated shop appears in the public listing, pending ones stay hidden',
      validatedList.data.some((shop) => shop.id === shopWithPhotoId) &&
        validatedList.data.every((shop) => shop.id !== plainShopId),
    );

    const nearName = encodeURIComponent(PHOTO_SHOP_NAME);
    const near = await readJson(
      await request(`/api/v1/shops?lat=52.52&lng=13.405&radiusKm=1&search=${nearName}`),
    );
    check(
      'GET /api/v1/shops geo filter returns the validated shop with a distance',
      near.data.length === 1 && near.data[0].id === shopWithPhotoId && typeof near.data[0].distanceKm === 'number',
    );

    const far = await readJson(
      await request(`/api/v1/shops?lat=0&lng=0&radiusKm=1&search=${nearName}`),
    );
    check('GET /api/v1/shops geo filter excludes shops outside radius', far.data.length === 0);

    const allShops = await readJson(await request('/api/v1/shops/all'));
    check(
      'GET /api/v1/shops/all includes the validated shop',
      allShops.data.some((shop) => shop.id === shopWithPhotoId),
    );

    const editPage = await request(`/admin/shops/${shopWithPhotoId}/edit`);
    check('admin edit page renders', editPage.status === 200);

    const ratingsPage = await request('/admin/ratings?status=validated');
    check(
      'admin ratings list shows validated ratings',
      ratingsPage.status === 200 && (await ratingsPage.text()).includes('Solid kebab'),
    );

    const logout = await request('/admin/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfToken }).toString(),
    });
    check('logout redirects to login', logout.status === 302);

    const afterLogout = await request('/admin');
    check('admin area is protected again after logout', afterLogout.status === 302);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('Failed checks:', failures.join(' | '));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('e2e smoke test crashed:', error);
  process.exit(1);
});

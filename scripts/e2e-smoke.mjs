/**
 * End-to-end smoke test against a running server (default http://localhost:3000).
 * Exercises the public API, photo upload/serving, the admin login flow (session +
 * CSRF) and the rating validation workflow including shop aggregate recomputation.
 *
 *   node scripts/e2e-smoke.mjs [baseUrl]
 */
const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000';

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

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (cookies.size > 0 && !options.noCookies) headers.cookie = cookieHeader();
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
    form.set('name', 'E2E Photo Shop');
    form.set('latitude', '52.52');
    form.set('longitude', '13.405');
    form.set('photo', new Blob([PNG_BYTES], { type: 'image/png' }), 'shop.png');
    const created = await request('/api/v1/shops', { method: 'POST', body: form });
    const createdBody = await readJson(created);
    shopWithPhotoId = createdBody?.data?.id;
    check(
      'POST /api/v1/shops (multipart with photo) returns 201, pending, hasPhoto',
      created.status === 201 &&
        createdBody.data.isValidated === false &&
        createdBody.data.hasPhoto === true &&
        typeof shopWithPhotoId === 'string',
    );

    const plain = await request('/api/v1/shops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'E2E Plain Shop', latitude: 52.53, longitude: 13.42 }),
    });
    const plainBody = await readJson(plain);
    plainShopId = plainBody?.data?.id;
    check(
      'POST /api/v1/shops (JSON) returns 201',
      plain.status === 201 && plainBody.data.isValidated === false,
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

  console.log('\nShop listing & geo filter');
  {
    const list = await request('/api/v1/shops?page=1&limit=2&search=E2E');
    const body = await readJson(list);
    check(
      'GET /api/v1/shops supports pagination and search',
      list.status === 200 &&
        body.data.length >= 1 &&
        body.pagination.limit === 2 &&
        body.data.every((shop) => shop.name.includes('E2E')),
    );

    const near = await request(
      '/api/v1/shops?lat=52.52&lng=13.405&radiusKm=1&search=E2E%20Photo',
    );
    const nearBody = await readJson(near);
    check(
      'GET /api/v1/shops geo filter returns the shop with a distance',
      near.status === 200 &&
        nearBody.data.length === 1 &&
        typeof nearBody.data[0].distanceKm === 'number',
    );

    const far = await request('/api/v1/shops?lat=0&lng=0&radiusKm=1&search=E2E%20Photo');
    const farBody = await readJson(far);
    check('GET /api/v1/shops geo filter excludes shops outside radius', farBody.data.length === 0);
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
      created.status === 201 && body.data.isValidated === false && body.data.overallRating === 4.33,
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

  console.log('\nMobile app API');
  let mobileShopId;
  {
    const allShops = await request('/mobileapp/v1/allShops');
    const allBody = await readJson(allShops);
    check(
      'GET /mobileapp/v1/allShops returns all shops, no pagination, no isValidated',
      allShops.status === 200 &&
        Array.isArray(allBody.data) &&
        allBody.pagination === undefined &&
        allBody.data.some((shop) => shop.id === plainShopId) &&
        allBody.data.every((shop) => !('isValidated' in shop)),
    );

    const add = await request('/mobileapp/v1/shop/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Mobile Shop',
        latitude: 52.54,
        longitude: 13.43,
        isValidated: true,
      }),
    });
    const addBody = await readJson(add);
    mobileShopId = addBody?.data?.id;
    check(
      'POST /mobileapp/v1/shop/add returns 201 and ignores the isValidated field',
      add.status === 201 && typeof mobileShopId === 'string' && !('isValidated' in addBody.data),
    );

    const storedShop = await readJson(await request(`/api/v1/shops/${mobileShopId}`));
    check(
      'shop created via mobile app is stored pending (is_validated = false)',
      storedShop.data.isValidated === false,
    );

    const missingShop = await request('/mobileapp/v1/shop/addRating', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shopId: '00000000-0000-4000-8000-000000000000',
        foodQualityRating: 5,
        priceFairRating: 4,
        interiorRating: 3,
      }),
    });
    check('mobile addRating for a missing shop returns 404', missingShop.status === 404);

    const addRating = await request('/mobileapp/v1/shop/addRating', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shopId: mobileShopId,
        foodQualityRating: 5,
        priceFairRating: 4,
        interiorRating: 3,
        isValidated: true,
      }),
    });
    const ratingBody = await readJson(addRating);
    const mobileRatingId = ratingBody?.data?.id;
    check(
      'POST /mobileapp/v1/shop/addRating returns 201 and ignores the isValidated field',
      addRating.status === 201 &&
        typeof mobileRatingId === 'string' &&
        !('isValidated' in ratingBody.data),
    );

    const storedRating = await readJson(await request(`/api/v1/ratings/${mobileRatingId}`));
    check(
      'rating created via mobile app is stored pending (is_validated = false)',
      storedRating.data.isValidated === false,
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
      shopsPage.status === 200 && shopsHtml.includes('E2E Photo Shop') && shopsHtml.includes('Validate'),
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
      publicRatings.data.length === 1 && publicRatings.data[0].isValidated === true,
    );

    const ratingDetail = await readJson(await request(`/api/v1/ratings/${ratingId}`));
    check('GET /api/v1/ratings/:id returns the validated rating', ratingDetail.data.isValidated === true);

    const validateShop = await request(`/admin/shops/${shopWithPhotoId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfToken, redirectTo: '/admin/shops' }).toString(),
    });
    check('admin validates the shop (302 redirect)', validateShop.status === 302);

    const validatedList = await readJson(
      await request('/api/v1/shops?isValidated=true&search=E2E'),
    );
    check(
      'validated shop appears in isValidated=true listing',
      validatedList.data.some((shop) => shop.id === shopWithPhotoId),
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

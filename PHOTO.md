# Photos in the mobile app (React Native)

How to upload and display shop/rating photos from the React Native client.
Photos live **inside the database** (`bytea` columns on `shop_table` and
`rating_table`) — there is no external storage service and no direct file
URLs. The API hands out a `photoUrl` pointing at a dedicated photo endpoint
that streams the bytes back with proper `Content-Type` and ETag caching.

## How the API represents a photo

Every shop and rating response (from `/api/v1/shops`, `/api/v1/shops/all`,
`/api/v1/shops/:id`, `/api/v1/ratings/:id`, rating lists) contains:

```json
{
  "hasPhoto": true,
  "photoUrl": "/api/v1/shops/1c0f…/photo"
}
```

- `hasPhoto` — decide whether to render an `<Image>` or a placeholder.
- `photoUrl` — `null` when there is no photo; otherwise a **relative** API
  path. Prefix it with your server origin before using it:
  `` const url = `${API_BASE}${shop.photoUrl}` ``.

Photo endpoints:

| Method | Path                       | Returns                                     |
| ------ | -------------------------- | ------------------------------------------- |
| GET    | `/api/v1/shops/:id/photo`  | Shop photo bytes (404 when absent).          |
| GET    | `/api/v1/ratings/:id/photo`| Rating photo bytes (404 when absent).        |

Rules that matter on the client:

- **All `/api/v1` routes require auth.** Send
  `Authorization: Bearer <accessToken>` — both for uploads and for the
  `<Image>` requests fetching photo bytes. Get a token pair via
  `GET /api/v1/oauth/token` (anonymous) or `POST /api/v1/oauth/login`.
- Only `image/*` files are accepted — anything else returns
  `400 BAD_REQUEST`.
- Max size is **5 MB** (`MAX_UPLOAD_MB`, default 5). Larger files return
  `400`. Check the picked asset's `fileSize` before uploading.
- The photo field name in the multipart form is **`photo`**.
- Uploaded shops/ratings (with or without photos) are **pending** until an
  admin validates them; they only appear in public listings afterwards.
  Photo bytes are served as soon as the entity exists.

## Uploading: create a shop with a photo

`POST /api/v1/shops` accepts `multipart/form-data`. All non-file fields must
be strings. In React Native the file part uses the `{ uri, name, type }`
shape (this is RN-specific — a web `Blob`/`File` works only in tests):

```ts
import { Platform } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';

async function pickAndCreateShop(accessToken: string) {
  const picker = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
  const asset = picker.assets?.[0];
  if (!asset) return; // user cancelled

  if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
    throw new Error('Photo must be 5 MB or smaller.');
  }

  const form = new FormData();
  form.append('name', 'Kebab King');
  form.append('latitude', '52.52');
  form.append('longitude', '13.405');
  form.append('photo', {
    uri: Platform.OS === 'ios' ? asset.uri!.replace('file://', '') : asset.uri!,
    name: asset.fileName ?? 'photo.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  });

  const response = await fetch(`${API_BASE}/api/v1/shops`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }, // no Content-Type!
    body: form,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? 'Upload failed');
  return body.data; // { id, hasPhoto: true, photoUrl: "/api/v1/shops/…/photo", … }
}
```

RN gotchas:

- **Do not set `Content-Type` manually.** The RN fetch implementation adds
  `multipart/form-data` with the correct `boundary` itself; a hand-written
  header with a stale boundary breaks the upload.
- `uri` on iOS often needs the `file://` prefix stripped (see above);
  content-URI paths on Android are used as-is.
- Text fields appended to `FormData` are sent as strings — pass `'52.52'`,
  not `52.52`.

## Uploading: submit a rating with a photo

Same pattern, `POST /api/v1/shops/:shopId/ratings`:

```ts
const form = new FormData();
form.append('foodQualityRating', '5');
form.append('priceFairRating', '4');
form.append('interiorRating', '5');
if (notes) form.append('notes', notes); // optional, <= 2000 chars
if (asset) {
  form.append('photo', {
    uri: Platform.OS === 'ios' ? asset.uri!.replace('file://', '') : asset.uri!,
    name: asset.fileName ?? 'photo.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  });
}

const response = await fetch(`${API_BASE}/api/v1/shops/${shopId}/ratings`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form,
});
```

A rating is also valid without a photo — simply omit the `photo` part and
send JSON instead of `multipart/form-data` if you prefer.

## Displaying photos

Because the photo endpoints require a Bearer token, pass auth headers in the
`Image` source — React Native's `<Image>` supports this natively:

```tsx
function ShopPhoto({ shop, accessToken }: { shop: Shop; accessToken: string }) {
  if (!shop.hasPhoto || !shop.photoUrl) {
    return <PlaceholderImage />;
  }
  return (
    <Image
      source={{
        uri: `${API_BASE}${shop.photoUrl}`,
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'default',
      }}
      style={{ width: 120, height: 120, borderRadius: 8 }}
      resizeMode="cover"
    />
  );
}
```

Works the same for rating photos (`photoUrl` from `/api/v1/ratings/:id`).

Notes:

- The server answers with `Cache-Control: public, max-age=3600` and an
  `ETag`, and returns `304` on a matching `If-None-Match`. The OS-level
  HTTP cache honours this for plain `<Image>`; `expo-image` handles
  caching/disk persistence more aggressively if you use Expo.
- If the photo 404s (entity has no photo), just fall back to the
  placeholder — `hasPhoto` should normally prevent this.
- If the access token has expired, the image request fails with 401.
  Refresh the token (`POST /api/v1/oauth/token` with `refreshToken`) and
  re-render; do not retry with the same stale token.

## Error handling cheat-sheet

| Status | Error code         | Meaning / client action                                |
| ------ | ------------------ | ------------------------------------------------------ |
| 400    | `VALIDATION_ERROR` | Bad fields (e.g. latitude 999). Show `error.details`.   |
| 400    | `BAD_REQUEST`      | Not an image, or file larger than 5 MB.                 |
| 401    | `UNAUTHORIZED` / `INVALID_ACCESS_TOKEN` | Refresh the token pair and retry. |
| 404    | —                  | Photo endpoint when the entity has no photo.            |
| 429    | `RATE_LIMITED`     | Too many writes; back off and retry later.              |

Error bodies always look like `{ "error": { "code", "message", "details?" } }`.

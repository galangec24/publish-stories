# API reference

- **Base URL:** `https://story-api-gmpg.onrender.com/api/`. Locally it's `http://localhost:8000/api/`.
- **Auth:** `Authorization: Bearer <access JWT>`. Access tokens last 15 minutes. Refresh with `POST auth/token/refresh/ {refresh}`.
- **Guests:** send `X-Viewer-Id: <random id>` (16–64 characters, kept in localStorage). It identifies the device for views, purchases, progress and ratings, and is stored only as a hash.
- **Errors:** DRF style, `{"detail": "..."}` or `{"field": ["message"]}`. Rate limits answer `429` with `retry_after`.

Legend: 🌐 anyone · 👤 signed in · 🛡️ admin

## Auth and account

| Method & path | Who | Purpose |
|---|---|---|
| `POST auth/register/` | 🌐 | Email sign-up; sends a 6-digit code |
| `POST auth/verify-email/` | 🌐 | `{email, code}` → tokens |
| `POST auth/resend-code/` | 🌐 | Resend the code (cooldown and limits apply) |
| `POST auth/login/` | 🌐 | `{email, password}` → tokens (`403 email_not_verified` until verified) |
| `POST auth/google/` | 🌐 | Google ID token → tokens |
| `POST auth/password/reset/`, `…/reset/confirm/` | 🌐 | Reset with an emailed code (unknown emails get `404`) |
| `POST auth/token/refresh/`, `POST auth/logout/` | 🌐 / 👤 | Token refresh and revoke |
| `GET/PATCH user/me/` | 👤 | Profile (not email) |
| `PUT user/genres/` | 👤 | `{genre_ids}`, the favourite genres |
| `PUT user/theme/` | 👤 | `light`, `dark` or `sepia` |
| `user/email-change/…` | 👤 | Request, send-code and confirm for an admin-approved email change |

## Reading

| Method & path | Who | Purpose |
|---|---|---|
| `GET home/` | 🌐 | Shelves, genres, stats, `has_columns` |
| `GET stories/?q=&genre=&column=slug\|none\|any&free=&ordering=popular\|readers` | 🌐 | Story list |
| `GET stories/<slug>/` | 🌐 | Story with chapters. Locked chapters have `content: null`. Also returns `has_access` and `purchase` (the latest QR purchase) |
| `POST stories/<slug>/view/` | 🌐 | Count a view (once per reader per day) |
| `POST stories/<slug>/progress/` | 🌐 | `{chapter}`: the reader opened a readable chapter |
| `GET/POST stories/<slug>/rating/` | 🌐 | Rating state, or `{stars: 1-5}`. Guests must have read every chapter; admins can't rate |
| `POST/DELETE stories/<slug>/like/` | 👤 | Like or unlike |
| `GET/POST stories/<slug>/comments/`, `DELETE comments/<id>/` | 🌐 / 👤 | Comments (one level of replies) |
| `GET search/suggest/?q=` | 🌐 | Up to 8 stories with `hot`, `recommended` and rating; without `q`, the trending ones |
| `GET columns/`, `GET columns/<slug>/` | 🌐 | Columns tab (public columns, or ones with published pieces) |
| `GET genres/`, `GET stats/`, `GET about/` | 🌐 | Reference data |
| `GET media/images/<uuid>.webp` | 🌐 | Story pictures and QR images (cached forever) |
| `GET translate/languages/`, `POST translate/` | 🌐 | Page translator |

## Paying

| Method & path | Who | Purpose |
|---|---|---|
| `GET payment-methods/` | 🌐 | QR codes (with `qr_payload`), plus `online_checkout` and its mode |
| `POST payments/manual/` (multipart) | 🌐 | `story, method, reference, proof (image), payer_name?, payer_email?` → purchase, unlocked immediately |
| `GET payments/manual/<access code>/` | 🌐 | A purchase's status |
| `POST access/claim/` | 🌐 | `{code}`: unlock on this device |
| `GET my-purchases/` | 🌐 | This account's or this device's purchases, with state and reason |
| `POST subscribe/<story_id>/` | 🌐 | PayMongo checkout (admins only in test mode) |
| `GET subscriptions/`, `GET subscriptions/<id>/` | 👤 | PayMongo purchases |
| `POST webhook/paymongo/` | PayMongo | Signed webhook |

## Notifications and support

| Method & path | Who | Purpose |
|---|---|---|
| `GET notifications/`, `POST notifications/<id>/read/`, `POST notifications/read-all/` | 👤 | Bell |
| `GET support/`, `POST support/messages/` | 🌐 | My conversation, by account or (for guests) by this device. Messages take `body`, `gif_url` and/or a `file` (multipart), plus an optional `reply_to` (a message id in the same thread). Guests are limited to 20 messages an hour per IP |
| `GET support/unread/` | 🌐 | `{unread}`: support replies not read yet (doesn't mark them read) |
| `PATCH support/` | 🌐 guests | `{name, email}` so support can reply by email too |
| `POST support/switch/` | 🌐 guests | `{id}`: continue another recent conversation from the same connection (`GET support/` lists them in `others`) |
| `POST support/messages/<id>/react/`, `POST admin/support/messages/<id>/react/` | 🌐 / 🛡️ | `{emoji}` (❤️ 😆 😮 😢 😡 👍; the same again removes it) |
| `POST support/resume/` | 🌐 guests | `{email}` (same connection) or `{code}` (anywhere): continue an earlier guest conversation on this device. A new device on the same connection picks up the latest conversation automatically |
| `GET support/files/<message id>/` | 🌐 / 🛡️ | Download an attachment (the account or device that owns the thread, or an admin) |
| `GET support/gifs/?q=` | 🌐 | GIPHY search through the server |
| WebSocket `wss://…/ws/?token=<JWT>` | 👤 | Live events |

## Admin (🛡️)

| Path | Purpose |
|---|---|
| `admin/stories/` (CRUD), `…/<id>/publish/` (`{price?}`), `…/<id>/unpublish/` | Stories. The price is read-only once paid (`price_locked`) |
| `admin/stories/<id>/chapters/`, `…/chapters/reorder/`, `admin/chapters/<id>/` | Chapters (titles unique per story; the revision guards against overwrites) |
| `admin/stories/import/`, `admin/stories/import-one/` | Bulk import, or one manuscript with `preview=true` first |
| `admin/images/` | Upload a picture → URL |
| `admin/genres/`, `admin/columns/` | CRUD |
| `admin/about/` | About page content |
| `admin/comments/`, `admin/comments/<id>/hide\|unhide/` | Moderation |
| `admin/payment-methods/` | QR codes CRUD |
| `admin/payments/manual/?status=pending\|paid\|rejected\|all&q=` | QR payments (pending means to check) |
| `admin/payments/manual/<id>/proof/`, `…/approve/`, `…/reject/` | Receipt, confirm, revoke |
| `admin/sales/?period=&from=&to=&story=` | Sales report |
| `admin/payments/logs/`, `…/subscriptions/`, `…/pending/`, `…/unpaid-readers/` | Payment logs and readers monitor |
| `admin/support/`, `admin/support/<id>/`, `…/messages/` | Support inbox |
| `admin/email-requests/`, `…/<id>/decide/` | Email change approvals |
| `admin/activity/?q=&actor=&type=` | Activity log |

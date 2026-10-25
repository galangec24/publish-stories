# Architecture

## The pieces

```
 Reader's browser (PWA)                         Author's browser (/admin)
        │  HTTPS (JSON, JWT)   WebSocket /ws/          │
        ▼                                              ▼
 ┌─────────────────────────── Render: story-api ───────────────────────────┐
 │ gunicorn + uvicorn workers (ASGI)                                       │
 │  Django REST Framework  ── apps: accounts, catalog, payments,            │
 │                            notifications, support, translations, audit  │
 │  Django Channels       ── live notifications / chat / admin badges      │
 └───────┬──────────────────────────┬─────────────────────┬────────────────┘
         │ SQL (session pooler)     │ pub/sub             │ HTTPS
         ▼                          ▼                     ▼
  Supabase Postgres         Render Key Value      Brevo (email), Google (sign-in,
  (+ Supabase Storage        (Redis)              translation), GIPHY, PayMongo
   for chat files)
```

The website is a static build on **Firebase Hosting**: HTML is never cached, and assets are fingerprinted and cached forever. It talks only to the API.

## Backend apps

| App | Responsibility |
|---|---|
| `accounts` | Users (email + password with a 6-digit code via Brevo, or Google sign-in), JWT auth, OTP anti-spam, profile, theme, favourite genres, admin-approved email changes, `ensure_admin` command |
| `catalog` | Genres, columns, stories, chapters (Quill Delta JSON), story images, the paywall, views and readers, likes, comments, ratings and reading progress, search suggestions, About page, imports |
| `payments` | Payment methods (QR codes), purchases (`Subscription`), receipts, access grants, PayMongo checkout and webhook, My purchases, sales report |
| `notifications` | Notification rows, plus the WebSocket consumer that pushes them live |
| `support` | One support conversation per reader or per guest device, messages with GIFs and attachments, GIF search |
| `translations` | Cached page translation (Google Cloud Translation, MyMemory fallback) |
| `audit` | Middleware that records every successful admin change in the Activity log |

## Data model (main tables)

- **Story**: title, slug, author, synopsis, cover, column, genres, `price`, `free_chapters`, `status` (draft/published), typography, and the counters `view_count`, `reader_count`, `like_count`, `comment_count`, `rating_avg`, `rating_count`.
- **Chapter**: story, title (unique within the story), `order`, `content` (Quill Delta ops), `word_count`, `revision` (optimistic locking for the Studio).
- **StoryView**: one row per reader per story per day. `viewer_key` is a keyed hash, never a raw ID or IP.
- **ChapterRead**: a reader opened a chapter they were allowed to read. Used so guests can rate only after finishing.
- **StoryRating**: 1–5 stars, one per account or per device.
- **Subscription**: one purchase. `provider` is `manual` (QR transfer) or `paymongo`; `status` is pending, paid, rejected, failed or expired; plus `reference_number`, `access_code` and review fields.
- **AccessGrant**: a device allowed to read a purchase, and the network it was unlocked on (both hashed).
- **PaymentMethod**: a QR code readers scan, with its decoded `qr_payload`.
- **Conversation / Message / GuestDevice**: the support chat. A conversation belongs to an account, or to guests' devices (`GuestDevice`, hashed IDs; one conversation can have several devices). It also stores an optional name and email and a chat code. A guest opening the chat on a new device picks up the latest conversation from the same internet connection (last 30 days), and can switch between recent ones. The trade-off is that people sharing a connection (a home, mobile data) can reach each other's guest chats. The chat code works from anywhere. When a guest signs in on a device, their thread moves into the account. Messages can quote another message (`reply_to`) and carry one reaction per side. Notifications link to their conversation and are marked read when it's opened.
- **AdminLog**: the Activity log.

## How a story is served

`GET /api/stories/<slug>/` decides access **on the server**. It returns every chapter's title, but readers without access get `content: null` for chapters after `free_chapters`. Locked text never reaches the browser, so the anti-screenshot and anti-copy measures in the website are only deterrents. See [payments.md](payments.md) for who has access.

## Live updates

The browser opens `wss://…/ws/?token=<JWT>`. The server sends events only after the database transaction commits (`transaction.on_commit`), so clients never see data that was rolled back. Events cover notifications, support messages and admin badge counts (`payments.changed`, `support.message`, …). The channel layer is `RedisPubSubChannelLayer` with health checks and keep-alive, because idle sockets used to time out.

## Performance on the free plans

- The Render free plan sleeps after 15 idle minutes, and the first request then takes about a minute. To hide that, the website:
  - shows built-in About content immediately;
  - keeps the last home page, opened stories and the signed-in profile on the device;
  - refreshes all of them in the background.
- A GitHub Actions job (`.github/workflows/keep-warm.yml`) pings the API every 10 minutes. GitHub may delay or skip scheduled runs, so an external monitor (UptimeRobot) is more reliable. See [deployment.md](deployment.md).
- `CONN_MAX_AGE=0`: under ASGI each request may run in a different thread. Persistent connections used to exhaust Supabase's session pooler.
- New website versions install in the background and switch over at the next page change (`src/pwa/updates.js`), never in the middle of a chapter.

## Security and privacy decisions

- **Secrets** live only in Render's environment and git-ignored local files.
- **Viewer and device IDs and IPs** are stored as HMAC hashes keyed with `DJANGO_SECRET_KEY`.
- **Receipts and chat attachments** are served only through authenticated endpoints, to the owner and to admins. They are never public URLs.
- **The GIPHY key** stays on the server, which proxies the search.
- **OTP anti-spam:** 60-second cooldown, 4 codes per hour and 10 per day per account, a site-wide daily cap, a per-IP throttle, and a lockout after repeated wrong codes.
- **Throttles** cover sign-in, comments, chat, payment submissions, access-code claims and views (`DEFAULT_THROTTLE_RATES` in `config/settings.py`).
- **Admins can't rate stories**, so the author's own stars never count.
- **Admin actions** are recorded in the Activity log (`audit/middleware.py`). Long text such as chapter content is recorded by field name only, and secrets are never recorded.

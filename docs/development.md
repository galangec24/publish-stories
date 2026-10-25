# Local development

## Requirements

- Python 3.12 or newer (the project runs on 3.14 locally)
- Node.js 20 or newer
- Optional: Docker, for Postgres and Redis (`backend/docker-compose.yml`). Without them the API uses SQLite and an in-memory channel layer.

## API (`backend/`)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                # leave DATABASE_URL empty to use SQLite
python manage.py migrate
python manage.py seed_genres        # starter genres, only on an empty site
python manage.py runserver          # http://localhost:8000/api/
```

**Making yourself an admin.** Either set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` and run `python manage.py ensure_admin`, or register normally and then run:

```bash
python manage.py shell -c "from accounts.models import User; User.objects.filter(email='you@example.com').update(is_admin=True, email_verified=True)"
```

**Emails.** Without `BREVO_API_KEY` and with `DJANGO_DEBUG=True`, verification codes are written to the server log instead of being sent.

**Tests.** `python manage.py test` runs the whole suite (over 100 tests). Run one app with `python manage.py test payments`. Tests use SQLite, so money and dates are formatted in code rather than relying on the database.

## Website (`web/`)

```bash
cd web
npm install
cp .env.example .env.local          # VITE_API_BASE_URL=http://localhost:8000/api
npm run dev                         # http://localhost:5173
npx vite build                      # production build into web/dist
```

## Project layout

```
backend/
  config/           settings, URLs, ASGI (HTTP + WebSocket routing)
  accounts/         users, auth, OTP, profile, email change
  catalog/          stories, chapters, paywall.py, ratings.py, search.py, community.py,
                    about.py, importers.py (docx/md/txt), images.py, analytics.py
  payments/         models, access.py (who can read), manual.py (QR flow),
                    views.py (PayMongo), reports.py (My purchases, sales)
  notifications/    notify(), WebSocket consumer
  support/          chat, storage.py (attachments), gifs.py (GIPHY)
  translations/     page translator
  audit/            Activity log middleware
web/src/
  pages/            Home, StoryPage, Purchases, auth pages, admin/* (Studio, QR payments,
                    Sales report, Activity log, …)
  components/       QrPaywall, SearchBox, StoryRating, ChatExtras, ThemePicker, …
  lib/              api.js (JWT + refresh, X-Viewer-Id), auth.jsx, qrph.js, useAsync.js
  realtime/         WebSocket client and LiveProvider
  pwa/              install prompt, updates.js (when new versions take over)
frontend/           Flutter apps (not maintained yet)
samples/            test manuscript (4 chapters and a picture)
```

## Conventions

- **Access is decided on the server**, never in the client.
- **Admin pages** live under `/admin`. API endpoints for them use the `IsAdmin` permission and are recorded automatically by the audit middleware.
- **Live events** are sent after the transaction commits (`transaction.on_commit`).
- **Data the page needs instantly** goes through `useCachedAsync(key, fn)`, which shows the last good response and refreshes it.
- **Secrets** go in `.env` / `.env.local`, which are git-ignored, and in Render. Never in code, never in `render.yaml` values.
- **Commits** are authored by the repository owner.

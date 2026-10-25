# Publish Stories

A story-reading website for **Maria Gemima Valderrama**, a Davao-based journalist, columnist and educator. Readers browse her columns and stories, read the first chapters free, and unlock the rest by scanning her GCash or bank QR code. No account is needed.

- **Live site:** https://publish-stories-ph.web.app
- **API:** https://story-api-gmpg.onrender.com/api/

| Part | Technology | Hosted on |
|---|---|---|
| Website (`web/`) | React 19, Vite 6, Tailwind CSS 4, installable PWA | Firebase Hosting |
| API (`backend/`) | Django 5 + Django REST Framework, Channels (WebSockets) on ASGI | Render (free plan) |
| Database | PostgreSQL | Supabase |
| Live updates | Redis (Render Key Value) | Render |
| Mobile/desktop apps (`frontend/`) | Flutter | Not built or published yet; behind the website |

## What it does

**For readers**
- Home page with shelves (For you, Most read, New & updated, Free reads, by genre), a separate **Columns** tab, and a **Find your genre** section.
- Search as you type, with covers, recent searches, and **Hot read**, **Recommended** and star-rating tags.
- Two reading modes, book pages or one long scroll, and Light, Dark or Sepia themes.
- **Free chapters, then pay once.** The author decides how many chapters are free.
- **QR payments without an account.** Scan GCash or a bank QR that already carries the price, upload the receipt and type the reference number, and the story opens immediately. It also opens on other devices on the same home Wi-Fi, and anywhere the reader enters their access code.
- Likes, comments (with Admin/Reader badges), 1–5 star ratings, and **My purchases** with each payment's status.
- Support chat with emoji, GIFs and file attachments, plus live notifications.
- Live page translator (Google Cloud Translation, with a free fallback).
- Light anti-capture measures on story text. The real protection is that locked chapters are never sent to the browser.

**For the author (admin)**
- **Story Studio**: a Word-style editor with chapters, pictures, fonts and sizes, and a free/paid lock on each chapter.
- Upload one manuscript (.docx/.md/.txt) with a chapter preview, or bulk-import many at once.
- QR payment review (confirm or revoke), searchable. You can also manage the QR codes themselves; uploading one reads the QR and fills in the details.
- Sales report (daily, weekly, monthly, yearly, per story, CSV export), readers and payments monitor, and comment moderation.
- Support inbox, email-change requests, an editable About page, genres and columns, and an **Activity log** of every admin change.

## Documentation

| Document | For | What's inside |
|---|---|---|
| [docs/admin-guide.md](docs/admin-guide.md) | The author and admins | Day-to-day tasks, step by step, with no code |
| [docs/architecture.md](docs/architecture.md) | Developers | How the pieces fit, data model, security and privacy decisions |
| [docs/payments.md](docs/payments.md) | Developers | QR payments, access rules (device, network, access code), PayMongo, reports |
| [docs/development.md](docs/development.md) | Developers | Run it on your computer, tests, project layout, conventions |
| [docs/deployment.md](docs/deployment.md) | Whoever deploys | Render, Supabase, Firebase, every environment variable, keeping the API awake |
| [docs/api.md](docs/api.md) | Developers | Every API endpoint |
| [instructions.MD](instructions.MD) | History | The original project brief. Some designs there have since changed; the docs above describe the current behaviour |

## Quick start (local)

```bash
# API
cd backend
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                 # works as-is with SQLite for local hacking
python manage.py migrate && python manage.py seed_genres
python manage.py createsuperuser                     # then set is_admin on that user (see docs/development.md)
python manage.py runserver

# Website (second terminal)
cd web
npm install
cp .env.example .env.local
npm run dev                                          # http://localhost:5173
```

Run the tests with `cd backend && python manage.py test`.

## Deploying

Push to `main`, and Render rebuilds the API (migrations run on start-up). Then build and deploy the website:

```bash
cd web && npx vite build && npx firebase deploy --only hosting
```

Deploy the API first whenever the website needs a new endpoint. See [docs/deployment.md](docs/deployment.md).

## Secrets

Never commit keys, passwords or connection strings. They live only in the Render dashboard (**story-api → Environment**) and in git-ignored local files (`backend/.env`, `web/.env.local`, `web/.env.production`). `render.yaml` lists their names with `sync: false`, never their values.

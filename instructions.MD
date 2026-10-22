# Story Platform: Full Project Description

## 1. What We Are Building

A story-reading platform for Philippine audiences. Readers browse free columns, read previews of novels and short stories, and unlock full stories through QR Ph payments. It ships as four clients:

- **Website:** a **React + Tailwind** app (in `web/`). It is an installable **PWA** and has a 3D look.
- **Windows, Android and iOS apps:** one **Flutter** codebase (in `frontend/`).

A single Django REST backend backed by PostgreSQL powers all of them. PayMongo handles QR Ph payments, so readers can pay with GCash, Maya, or their bank app.

The product has two audiences:

- **Readers** sign in with Google or with email and password. Email accounts are verified with a 6-digit code sent through Brevo. Readers pick their favourite genres, read stories, and pay to unlock paywalled ones.
- **Administrators** curate content. They write stories in a Word-style **Story Studio**, bulk-upload many manuscripts at once with genre tagging, set prices, and manage the catalog.

## 2. The Reader Experience

A reader opens any client and lands on a home screen. Signing in is not needed to browse. The home screen shows:

- a **genre filter bar**: tap one or more genres to filter the catalog, combined with a search box for titles and authors;
- a **"For you"** shelf built from the genres the reader picked during onboarding;
- **public columns**, which are always free and styled like an editorial section;
- **New & updated**, **Free reads**, and one shelf per genre.

Stories in a public column, and stories priced at ₱0, are fully readable. Every other story follows a freemium paywall. The reader sees a preview of the first *N* paragraphs (set by the admin), counted across chapters in order. The table of contents still lists every chapter, with a lock icon on the withheld ones. The rest is locked until the reader pays.

When a reader taps **Unlock story**, the app asks them to sign in if they haven't. It then creates a PayMongo Checkout Session for that story's price and opens the hosted checkout, which shows a QR Ph code. The reader scans it with GCash, Maya, or a bank app. PayMongo fires a webhook to our server, the server marks the subscription paid, and the app (which polls the subscription every few seconds) reloads the story with full content.

Readers also get a theme selector with three options: Light, Dark, and Sepia. The choice is saved to their account and applied on every client they log into.

### 2.1 Sign-in and Account Verification

| Method | How it works |
|---|---|
| **Google (Gmail)** | Android, iOS and Web use the `google_sign_in` plugin and send Google's **ID token** to `POST /api/auth/google/`. The server verifies the signature, issuer, audience (it must be one of our OAuth client IDs) and `email_verified`. Windows has no plugin support, so it runs the OAuth **loopback + PKCE** flow: the system browser opens, and the redirect is caught on a throwaway `127.0.0.1` port. The app sends the authorization code to the server, which exchanges it using the desktop client secret, so the secret never ships inside the app. |
| **Email + password** | `register` creates an unverified account, and **Brevo** emails a 6-digit code. `verify-email` checks the code and returns JWTs. Login is refused (`403 email_not_verified`) until the email is verified, and a fresh code is sent automatically. |
| **Password reset** | `password/reset` emails a code through Brevo. `password/reset/confirm` sets the new password and revokes every existing refresh token. |

Rules:

- **Account linking.** If a Google sign-in matches an existing email account, the two are linked. If that email account was never verified, its password is discarded, because nobody had proven they own the inbox.
- **Code security.** Codes expire after 10 minutes and are stored only as an HMAC hash. They allow 5 attempts, and a new code invalidates the previous one. Resends have a 60-second cooldown, and auth endpoints are rate-limited.
- **No account enumeration.** Responses to "resend code" and "forgot password" don't reveal whether an account exists.
- **Brevo setup.** Brevo sends through its transactional API (`POST https://api.brevo.com/v3/smtp/email`). Optional Brevo template IDs can replace the built-in email HTML. In development without an API key, codes are written to the server log instead of being sent.

### 2.2 Page Style: Book or Long Page

Readers choose how a story is laid out. The choice is saved to the account (`reading_mode`) so it follows them across devices; guests keep it per browser.

- **📖 Book:** the chapter is split into pages.
  - **Web:** the browser paginates the text with CSS columns. Wide screens show a two-page spread with a centre fold.
  - **Turning pages:** swipe left or right, tap the outer edges, use the ← → or Page Up/Down keys, or drag the page slider. Each turn has a page-sweep animation.
  - **Between chapters:** turning past the last page opens the next chapter, and going back from the first page opens the previous chapter at its end.
  - **Apps:** a swipeable `PageView` with a few paragraphs per page.
- **📜 Long page:** the whole chapter scrolls as one page, with Previous/Next chapter buttons.

Switch from the toggle on the story page, or under Settings → Page style.

### 2.3 Views and Readers

Every story shows a **view count** and a **reader count** to everyone: on the book covers, on the story page, and in the admin list (which can sort by either).

- **Views:** one reader opening the story on a given day. Reloading or reading every chapter doesn't inflate it.
- **Readers:** distinct people who have ever opened the story.
- **How readers are identified:**
  - signed-in readers by their account, so one person on three devices counts once;
  - guests by a random per-browser ID (`X-Viewer-Id`), falling back to their IP address.
  - Only a keyed hash of the ID is stored, never the raw value.
- **Not counted:** admins previewing stories.

**Site-wide totals** (total readers, total views, published stories) appear on the home page and on the admin dashboard. A **Most read** shelf ranks stories by views.

### 2.4 Genre Onboarding

After the first sign-in, a reader who hasn't chosen genres sees **"What do you like to read?"**: a grid of colour-coded genre chips. They can pick any number or skip. The choice is stored on the account (`PUT /api/user/genres/`), drives the "For you" shelf, and can be changed later in Settings. Admins manage the genre list (name, colour, description, order, visibility). `python manage.py seed_genres` creates a starter set, including *Philippine Folklore* and *Teen Fiction*.

## 3. The Admin Experience

Admins log into the same clients. An **Admin studio** button appears only for accounts flagged `is_admin`. The admin area has a navigation rail with five sections: **Stories · Import · Genres · Columns · Payments**.

### 3.1 Story Studio (the Word-style editor)

Opening or creating a story opens the Studio. Its layout is modelled on Microsoft Word:

```
┌ Title bar: story title · Draft/Published · "All changes saved" · ⚙ Story settings · [Publish] ┐
├ Ribbon tabs:  Home | Insert | View | Review                                                   ┤
├ Ribbon:  [History] undo redo │ [Font] B I U S clear │ [Paragraph] • 1. " ≡ │ [Styles] Normal H1 H2 H3 ┤
├──────────────┬─────────────────────────────────────────────────────────────────────────────────┤
│ Navigation   │                                                                                 │
│ ▸ Prologue   │            ┌──────────── page (8.5" wide, paper colour) ────────────┐            │
│ ▾ Chapter 1  │            │  rich-text editor (Quill)                               │            │
│     Heading  │            └─────────────────────────────────────────────────────────┘            │
│ ▸ Chapter 2  │                                                                                 │
├──────────────┴─────────────────────────────────────────────────────────────────────────────────┤
└ Status bar: Chapter 2 of 5 · 1,234 words · Story: 12,345 words · zoom slider 100%              ┘
```

- **Home tab:** undo/redo, bold, italic, underline, strikethrough, clear formatting, bullets, numbering, quote, alignment, and the Normal / Heading 1–3 styles. Standard shortcuts work (Ctrl+B/I/U/Z/Y).
- **Insert tab:** *New chapter*, *Split chapter here* (everything after the cursor becomes a new chapter), and *Scene break* (a centred `* * *`).
- **View tab:** toggle the navigation pane, zoom from 70% to 200%, and *Open as reader* to preview exactly what readers will see.
- **Review tab:** *Find* (Ctrl+F) and *Word count* (chapter, characters, paragraphs, whole story, preview size).
- **Navigation pane:** works like Word's. It lists the chapters, which you can drag to reorder, rename, or delete. Under the open chapter, it lists that chapter's headings, and clicking one jumps to it.
- **Story settings drawer:** title, author, synopsis, cover upload, **genre tags**, column, price in pesos (0 = free, otherwise at least ₱20, PayMongo's minimum), and the number of free preview paragraphs.
- **Saving:** chapters **autosave** two seconds after the last keystroke, and Ctrl+S saves immediately. Each chapter has a `revision` number. If two admins edit the same chapter, the second save gets `409 Conflict`, and the Studio asks whether to keep their own version or load the other one, so work is never silently overwritten.
- **Publishing:** *Publish* / *Unpublish* act on the whole story. An empty story can't be published.

Chapter content is stored as a **Quill Delta** (JSON), which keeps formatting intact across every platform. The server validates it before saving.

### 3.2 Bulk Import (many stories at once)

**Import** accepts up to 50 manuscripts per upload (.docx, .md, .txt; max 10 MB each).

| File | Chapter breaks | Also read from the file |
|---|---|---|
| Word `.docx` | *Heading 1* paragraphs | The *Title* style becomes the story title (otherwise the document's Title property). Bold, italic, underline, strike, Heading 2/3, lists, quotes and alignment are kept. |
| Markdown `.md` | `# ` headings | Front matter between `---` lines: `title`, `author`, `synopsis`, `genres: Romance, Drama`. Also `##`/`###`, `**bold**`, `*italic*`, lists, `>` quotes, and `---` scene breaks. |
| Text `.txt` | Lines like `Chapter 3`, `Kabanata 3`, `Part II`, `Bahagi 2`, `Prologue` | A first line of `Title: …`. Paragraphs are separated by blank lines. |

**Genre tagging** works at two levels:

- **Batch genres** are applied to every file.
- **Per-file overrides** let you replace the genres and title for an individual file.

Genres named in Markdown front matter are added too. Unknown names are reported as warnings, or created automatically if *Create missing genres* is on. Column, price, preview length and draft/publish status are set for the whole batch.

Each file is imported in its own database transaction, so one corrupt file doesn't sink the batch. The results list shows chapters, word count, genres and warnings for each file, with an **Open in Studio** button.

### 3.3 Other Admin Sections

- **Genres:** create, edit, recolour, hide, and drag to reorder.
- **Columns:** create and edit columns, and mark each one public (free) or paywalled.
- **Payments:** webhook log with status (paid / duplicate / unmatched / rejected) and the raw PayMongo payload for auditing. A subscription list is also available.

All admin endpoints live under `/api/admin/...` and are protected by a custom `IsAdmin` permission that checks the `is_admin` flag. Django's built-in admin UI is not used.

## 4. The Website: React PWA with a 3D Design

The website lives in `web/` and is built with React 19, Vite, Tailwind CSS v4 and React Router. It talks to the same Django API as the apps and has the same features: Google and email sign-in, genre onboarding, genre filters, the protected reader with paywall, themes, and the full admin area. The admin area includes the Story Studio, built on Quill 2, which saves the same Delta format as the Flutter editor.

### 4.1 Install as an app (PWA)

`vite-plugin-pwa` generates the web app manifest and a service worker. The service worker precaches the app shell and caches cover images. Story text is never cached, because what each reader may see depends on what they've paid for.

The install offer appears as a banner and an **Install app** button in the header and Settings. It **never appears when the app is already installed**. The app counts as installed if any of these is true:

1. It is running in standalone mode, meaning it was opened from the home screen, Start menu or dock.
2. The browser fired `appinstalled` earlier on this device. This is remembered in local storage.
3. `navigator.getInstalledRelatedApps()` lists the PWA. This works in Chromium on Android and desktop, using the manifest's `related_applications` entry.
4. The browser never fired `beforeinstallprompt`. Chromium only fires it when installation is possible, so on Chrome and Edge the button simply can't appear for an installed app.

If the reader uninstalls, the browser fires `beforeinstallprompt` again, so the offer comes back. "Not now" snoozes the banner for 7 days.

iOS Safari has no install API. There, the button opens step-by-step instructions (Share, then Add to Home Screen), and it hides once the app is launched from the home screen.

### 4.2 3D design

The design uses a deep night-sky palette with warm "reading lamp" amber accents, set in Fraunces (display), Inter (interface) and Literata (story text). The three themes (Light, Dark, Sepia) are CSS variables exposed as Tailwind colours.

- **Hero scene (Three.js):** built with react-three-fiber and drei. An open book floats with pages turning continuously, tilts with the cursor for parallax, and is surrounded by drifting books and sparkles. It is lazy-loaded. Readers who prefer reduced motion get static 3D book covers instead.
- **3D book covers:** every story card is a CSS-3D book with a spine, page edges and a gloss highlight, and it tilts toward the cursor. Rows of books sit on "shelves".
- **Reader:** a paper page with a soft drop shadow and book typography.

### 4.3 About Me

The home page ends with an **About Me** section for Maria Gemima Valderrama: her photo on a tilting 3D frame, her background (DepEd Davao Region, SunStar Davao, Ateneo de Davao University, DepEd Davao Dispatch), and links to SunStar and DepEd. The header has an **About** link that scrolls to it.

- The text lives in `web/src/components/AboutMe.jsx`.
- The photo is in `web/public/about/`.
- The originals (`about-me.txt`, `mom.jpg` in the project root) are kept out of git.

### 4.4 Live Translator

A 🌐 language picker in the header translates **every word on screen**: menus, buttons, toasts, the About section and story text.

**Languages:** English, Filipino, Cebuano (Bisaya), Ilocano, Spanish, Chinese, Japanese, Korean and Arabic. The list comes from the server (`GET /api/translate/languages/`), so new languages need no app update.

**How it works:**

- **On the page:** `web/src/i18n/liveTranslator.js` walks the page's text nodes (plus `placeholder`, `title`, `aria-label` and `alt`) and sends unseen strings in batches to `POST /api/translate/`, then swaps the words in place.
- **Keeping up:** a MutationObserver re-runs it whenever React renders something new, so navigation, new chapters and messages are translated as they appear.
- **Switching back:** choosing English restores the original text exactly.
- **On the server:** every translation is cached in the database per string, language and provider, so each sentence is only paid for once. Browsers also keep a local copy.
- **Providers:**
  - With `GOOGLE_TRANSLATE_API_KEY` set, it uses Google Cloud Translation (best quality; the first 500k characters a month are free).
  - Otherwise it uses the free MyMemory service, which is lower quality and has a small daily quota. Adding a Google key later automatically replaces the MyMemory results as pages are visited.
- **Not translated:** anything marked `translate="no"` or `.notranslate` (the brand name, her name, the watermark) and the Story Studio editor. Words people type into forms are left alone, but placeholders are translated.

## 5. Content Protection (Screenshots & Screen Recording)

Protected screens are the reader and the Studio page. They are wrapped in a `ProtectedContent` component (a widget in Flutter, a React component on the web) that turns on the strongest protection each platform allows, hides content when capture is likely, disables text selection and copying, and tiles a faint **watermark with the reader's email** so any leak is traceable.

| Platform | What happens | Strength |
|---|---|---|
| **Android** | `FLAG_SECURE` on the window. Screenshots, screen recordings, casting and the recent-apps thumbnail come out **black**. | Fully blocked by the OS |
| **Windows** | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. **Snipping Tool**, Print Screen, Game Bar, OBS, and Teams/Zoom sharing capture an empty area instead of the window. | Blocked by the OS (Windows 10 2004+) |
| **iOS** | Apple doesn't allow blocking screenshots. While the screen is being **recorded, mirrored or AirPlayed**, the content is replaced with a "Content hidden" cover. After a screenshot, the reader sees a warning. | Recording hidden; screenshots deterred |
| **Web** | Browsers have no API to block capture. The story is covered with a "Content hidden" screen whenever the tab is hidden or the window **loses focus**. Pressing **Win+Shift+S** opens Snipping Tool, which takes focus, so the snip shows the cover instead of the story, much like switching to another tab. Print Screen and macOS screenshot shortcuts trigger the cover and overwrite the clipboard. Printing, Ctrl+S, right-click, copy and text selection are disabled. | Deterrent only |

**Honest limits.** On the web and iOS, a determined user can still capture content, for example with a phone camera, a capture tool that doesn't take focus, or a virtual machine. The server-side paywall is the real protection: locked readers never receive the full text. The watermark covers the rest.

## 6. Technology Choices and Why

- **React + Tailwind (website).** React has the best web tooling for a PWA, and Tailwind makes the 3D, themed design quick to build. Key packages are `vite-plugin-pwa`, `@react-three/fiber` and `drei` (3D), `quill` (Studio editor) and `react-router-dom`.
- **Flutter (Windows, Android, iOS).** One Dart codebase gives native apps, with the platform features the screen guard needs. Key packages are `flutter_quill`, `google_sign_in`, `file_picker`, `flutter_secure_storage` and `provider`.
- **Django + Django REST Framework** is the backend, giving us an ORM, migrations, auth primitives, serializers, viewsets and permission classes.
- **PostgreSQL** is the database. It provides JSON fields (Delta documents, webhook payloads), exact decimals for prices, and indexed slugs.
- **PayMongo with QR Ph** is the payment rail. It hosts the checkout page (so we avoid PCI scope) and sends signed webhooks.
- **Google Identity** handles Gmail sign-in, verified server-side with `google-auth`.
- **Brevo** sends transactional email (verification and password-reset codes).
- **JWT** (`djangorestframework-simplejwt`) issues short-lived access tokens and rotating refresh tokens (with a blacklist) stored securely on the device.

## 7. How the Pieces Fit Together

- **The clients (React web and Flutter apps) are thin.** They render UI, hold the JWT, call the API, and open the PayMongo checkout in the system browser. They never see full story content unless the server decides the user is entitled to it.
- **The Django backend is the source of truth.** It verifies Google tokens and email codes, enforces the paywall by truncating Delta content server-side, creates checkout sessions with the admin-set price, verifies and records webhooks, and exposes the admin API.
- **PostgreSQL** stores users, OTP codes, themes, genres and genre preferences, columns, stories, chapters, subscriptions and payment logs.

A paid unlock flows like this:

1. Flutter calls `POST /api/subscribe/<story_id>/`.
2. Django creates a PayMongo Checkout Session (`payment_method_types: ["qrph"]`) and returns `checkout_url`.
3. Flutter opens the URL, and the reader pays by scanning the QR code.
4. PayMongo posts `checkout_session.payment.paid` to `/api/webhook/paymongo/`.
5. Django verifies the signature and timestamp, locks the subscription row, and checks `status != "paid"` (the idempotency guard).
6. Django marks it paid, writes a `PaymentLog`, and returns 200.
7. The app's poll sees `paid` and reloads the full story.

## 8. Content and Paywall Rules

Access is decided entirely on the server:

1. If the story is in a column with `is_public=True`, or its price is ₱0, it is **free**: full content, `locked: false`.
2. If the reader is an admin, or has a **paid** subscription for this story, they get full content.
3. Otherwise the reader gets the first `preview_page_count` non-empty paragraphs (Delta lines), counted **across chapters in order**:
   - the chapter where the preview runs out is cut at that paragraph;
   - later chapters are returned with `content: null` (title only);
   - the response carries `locked: true`.

The client renders whatever it receives and can't unlock anything on its own.

## 9. Payments and the QR Ph Flow

The backend calls PayMongo's `POST /v1/checkout_sessions` with:

- the story title, and the price converted to centavos, in PHP;
- `payment_method_types: ["qrph"]`;
- the subscription ID as `reference_number` and in `metadata`;
- success and cancel URLs pointing back to the web app.

Pricing and account requirements:

- The minimum charge is **₱20**, so paid stories must cost at least that.
- PayMongo charges roughly 1.5% per successful QR Ph payment.
- Going live requires a registered business (DTI or SEC) and QR Ph enabled on the PayMongo account.

The webhook endpoint:

- verifies the `Paymongo-Signature` header (`t=…,te=…,li=…`): an HMAC-SHA256 of `"<t>.<raw body>"` with the webhook secret, using `te` in test mode and `li` in live mode, and rejecting timestamps older than 5 minutes;
- acts only on `checkout_session.payment.paid`;
- locks the subscription row and checks `status != "paid"`, so a duplicate webhook from PayMongo's retries can't double-write;
- stores every event, including rejected ones, in `PaymentLog.raw_webhook`.

## 10. Themes

Each user has a `UserTheme` record (`light`, `dark` or `sepia`). The app reads it from `/api/user/me/` at start and applies it at the `MaterialApp` root. Changing it applies instantly and calls `PUT /api/user/theme/`. The reader and the Studio draw a paper-coloured page that follows the theme.

## 11. Deployment: Render + Firebase

**Recommendation: use both, each for what it does best.**

| Piece | Host | Why |
|---|---|---|
| Django API | **Render** (Web Service, Singapore region) | Runs Python and gunicorn natively, deploys from Git, and handles TLS. Firebase can't run Django directly; it would need Cloud Run, which is more work. |
| PostgreSQL | **Supabase** (Singapore) | The free database doesn't expire (Render's free one is deleted after 30 days) and has a built-in table editor. The API connects through Supabase's Session pooler. |
| React PWA (`web/`) | **Firebase Hosting** | A global CDN with a generous free tier, HTTPS (which PWAs require), instant rollbacks, SPA rewrites and a custom domain. |
| Cover images | **Firebase Storage** (a Google Cloud Storage bucket) | Render's disk is wiped on every deploy. Set `GS_BUCKET_NAME` and Django stores uploads there through `django-storages`. |
| Email | Brevo | Transactional API |
| Payments | PayMongo | Point the webhook at `https://<api>.onrender.com/api/webhook/paymongo/`. |

**Backend (Render)**

1. Create the Supabase database first (see 11.1) and copy its Session pooler connection string.
2. In Render choose **New → Blueprint** and select the repo. `render.yaml` creates the API service.
3. When prompted, paste the Supabase string into `DATABASE_URL`, and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first admin account.
4. Fill in the other prompted secrets (Google client IDs, Brevo, PayMongo), or enter `none` for now and update them later in **Environment**.
5. On every start the service runs `migrate`, `seed_genres` and `ensure_admin` (which creates or promotes the `ADMIN_EMAIL` account, since free instances have no shell), then starts gunicorn.
6. Later, in the **Environment** tab, add `GOOGLE_DESKTOP_CLIENT_ID` and `GOOGLE_DESKTOP_CLIENT_SECRET` for Windows sign-in. For cover images, add `GS_BUCKET_NAME` plus a **Secret File** `gcs.json` with `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gcs.json`.

**Web (Firebase Hosting)**

Create `web/.env.production` (it is not committed):

```
VITE_API_BASE_URL=https://<your-service>.onrender.com/api
VITE_GOOGLE_CLIENT_ID=xxxx-web.apps.googleusercontent.com
```

Then build and deploy:

```bash
cd web
npm ci
npm run build
firebase login:use galangec24@gmail.com    # web/.firebaserc already targets publish-stories-ph
firebase deploy --only hosting             # → https://publish-stories-ph.web.app
```

Add the Firebase domain to the **Authorized JavaScript origins** of the Google web OAuth client.

**Apps**

- **Android** ships as an App Bundle (`flutter build appbundle`) to the Google Play Console. It needs the `applicationId` `ph.storyapp.story_app` (permanent after the first publish) and a release keystore. Register the keystore's SHA-1 on the Android OAuth client.
- **iOS** ships through App Store Connect. It needs an Apple Developer membership, a bundle ID matching the App ID, automatic signing, and the reversed iOS client ID added as a URL scheme in `Info.plist`.
- **Windows** ships as MSIX (`msix` package) to the Microsoft Store through Partner Center, which signs it. Direct `.exe` distribution shows "Unknown Publisher" without a code-signing certificate.

**Free-tier caveats.**
- **Render:** the free API sleeps after about 15 minutes idle, and the next request takes 30–60 seconds. Before taking real payments, switch to `plan: starter` and move the migrate step into `preDeployCommand`.
- **Supabase:** free projects pause after about 7 days without activity. Click **Restore** in the Supabase dashboard to resume, or use the Pro plan for production.

### 11.1 PostgreSQL

- **Production (Supabase):**
  1. At supabase.com, create a **New project** in region **Southeast Asia (Singapore)**. Use a database password without `@ : / ?`, or URL-encode those characters.
  2. Click **Connect**, choose **Session pooler**, and copy the URI.
     - **Don't use** "Direct connection": it is IPv6-only, and Render can't reach it.
     - **Don't use** the Transaction pooler on port 6543: it doesn't suit Django's persistent connections.
  3. Append `?sslmode=require`, giving: `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require`
  4. Paste it as `DATABASE_URL` in Render. Django creates the tables with `migrate` on start-up.
  5. Browse the data with Supabase's **Table Editor**, or with pgAdmin (same host, port 5432, database `postgres`, user `postgres.<ref>`, SSL mode `require`).
  6. Django manages the schema, so change tables through migrations, not in the Supabase UI. **Turn off Supabase's Data API** (Project Settings → Data API → disable). The app talks only to Django, and otherwise Supabase would expose Django's tables (users, payments) through its auto-generated REST API with Row Level Security off. The Security Advisor will flag "RLS disabled" until you do.
- **Local, option 1 (simplest):** leave `DATABASE_URL` unset and Django uses SQLite. Good enough for development and the tests.
- **Local, option 2 (Docker):** `docker compose up -d` in `backend/` starts Postgres 16 with database, user and password all set to `story`.
- **Local, option 3 (native Windows):** install PostgreSQL from postgresql.org/download/windows, then in **SQL Shell (psql)** run:

  ```sql
  CREATE USER story WITH PASSWORD 'story';
  CREATE DATABASE story OWNER story;
  ```

  Then set `DATABASE_URL=postgres://story:story@localhost:5432/story` in `backend/.env` and run `python manage.py migrate`.

## 12. Repository Layout

```
STORY-APP/
├── instructions.MD          ← this document
├── render.yaml              ← Render blueprint (API + Postgres)
├── backend/                 ← Django + DRF
│   ├── config/              settings (env-driven), urls
│   ├── accounts/            User, UserTheme, EmailOTP · Google + Brevo auth · /api/auth, /api/user
│   ├── catalog/             Genre, Column, Story, Chapter · delta.py (paywall truncation)
│   │                        importers.py (docx/md/txt) · admin_views.py (Studio + bulk import)
│   ├── payments/            Subscription, PaymentLog · paymongo.py · webhook
│   ├── .env.example         every required variable, documented
│   └── docker-compose.yml   local PostgreSQL
├── web/                     ← React 19 + Vite + Tailwind v4 PWA (the website)
│   ├── src/lib/             API client (JWT refresh), auth context, themes, Delta renderer
│   ├── src/pwa/             install prompt (never shown when already installed)
│   ├── src/components/      Hero3D (three.js), Book3D covers, ProtectedContent, UI kit
│   ├── src/pages/           home, story reader, auth, onboarding, settings
│   ├── src/pages/admin/     Story Studio (Quill), bulk import, genres, columns, payments
│   ├── vite.config.js       PWA manifest + service worker
│   └── firebase.json        Firebase Hosting config (project publish-stories-ph)
└── frontend/                ← Flutter (Windows, Android, iOS)
    ├── lib/api/             JWT client with auto-refresh, models
    ├── lib/auth/            Google sign-in (plugin + Windows loopback/PKCE)
    ├── lib/security/        ScreenGuard: FLAG_SECURE / WDA_EXCLUDEFROMCAPTURE
    ├── lib/screens/         login, register, verify email, reset, genre onboarding, home, reader, settings
    ├── lib/admin/           dashboard, Story Studio, bulk import
    ├── android/…/MainActivity.kt   FLAG_SECURE channel
    └── ios/Runner/AppDelegate.swift  capture/screenshot detection
```

## 13. API Reference

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register/` | public | Email sign-up; Brevo sends a code |
| `POST /api/auth/verify-email/` | public | `{email, code}` → JWTs |
| `POST /api/auth/resend-code/` | public | `{email, purpose}` |
| `POST /api/auth/login/` | public | Email login (403 `email_not_verified` until verified) |
| `POST /api/auth/google/` | public | `{id_token}` or `{code, code_verifier, redirect_uri}` |
| `POST /api/auth/password/reset/` · `…/confirm/` | public | Password reset by emailed code |
| `POST /api/auth/token/refresh/` · `/api/auth/logout/` | user | Rotate / blacklist refresh token |
| `GET/PATCH /api/user/me/` | user | Profile (theme, genres, is_admin, onboarded, `reading_mode`: `book`/`scroll`) |
| `GET/PUT /api/user/theme/` · `/api/user/genres/` | user | Theme; genre preferences (`{genre_ids: []}`) |
| `GET /api/home/` | public | Shelves: for_you, public_columns, latest, free, by_genre |
| `GET /api/genres/` · `/api/columns/` · `/api/columns/<slug>/` | public | Catalog |
| `GET /api/stories/?genre=a,b&q=&column=&free=true&ordering=popular\|readers` | public | Filtered story list |
| `GET /api/stories/<slug>/` | public | Story + chapters (paywalled), with `view_count` and `reader_count` |
| `POST /api/stories/<slug>/view/` | public | Record a view (once per reader per day) → `{view_count, reader_count}` |
| `GET /api/stats/` | public | `{total_readers, total_views, published_stories}` |
| `GET /api/translate/languages/` | public | Languages offered by the live translator |
| `POST /api/translate/` | public | `{target, texts: [...]}` → `{translations: [...]}` (cached; throttled) |
| `POST /api/subscribe/<story_id>/` | user | Create QR Ph checkout |
| `GET /api/subscriptions/` · `/api/subscriptions/<id>/` | user | My purchases; poll status |
| `POST /api/webhook/paymongo/` | PayMongo | Signed webhook |
| `/api/admin/genres/` · `/api/admin/columns/` · `/api/admin/stories/` | admin | CRUD (`?status=&genre=&q=` on stories) |
| `POST /api/admin/stories/<id>/publish/` · `…/unpublish/` | admin | Publishing |
| `GET/POST /api/admin/stories/<id>/chapters/` · `POST …/reorder/` | admin | Navigation pane |
| `GET/PATCH/DELETE /api/admin/chapters/<id>/` | admin | Load / autosave (send `revision`; 409 on conflict) |
| `POST /api/admin/stories/import/` | admin | Bulk import (multipart `files`, `genre_ids`, `manifest`, …) |
| `GET /api/admin/payments/logs/` · `…/subscriptions/` | admin | Audit |

## 14. Local Development

```bash
# Backend
cd backend
python -m venv .venv && .venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                                   # then fill in values
docker compose up -d                                     # PostgreSQL (or remove DATABASE_URL to use SQLite)
python manage.py migrate && python manage.py seed_genres
python manage.py createsuperuser                         # becomes an admin
python manage.py test                                    # auth, paywall, importers, studio, webhook
python manage.py runserver

# Website (React PWA)
cd web
copy .env.example .env.local                             # set VITE_API_BASE_URL / VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                                              # http://localhost:5173
npm run build && npm run preview                         # test the PWA install flow on :4173

# Apps (Flutter; first time: generate the platform folders, existing files are kept)
cd frontend
flutter create --org ph.storyapp --project-name story_app --platforms=windows,android,ios .
flutter pub get
flutter run -d windows --dart-define=GOOGLE_DESKTOP_CLIENT_ID=...
```

**Google Cloud Console setup.** Create four OAuth clients: *Web*, *Android* (package name plus SHA-1), *iOS* (bundle ID), and *Desktop app*. Put all four IDs in `GOOGLE_CLIENT_IDS`, and the desktop ID and secret in `GOOGLE_DESKTOP_*`.

**Where to get each key:**

| Key | Where |
|---|---|
| `GOOGLE_CLIENT_IDS`, `VITE_GOOGLE_CLIENT_ID` | https://console.cloud.google.com/apis/credentials → OAuth client ID → Web application (consent screen: https://console.cloud.google.com/auth/overview) |
| `GOOGLE_TRANSLATE_API_KEY` | Enable https://console.cloud.google.com/apis/library/translate.googleapis.com, then create an API key at https://console.cloud.google.com/apis/credentials. Billing must be on. |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` | https://app.brevo.com/settings/keys/api · https://app.brevo.com/senders |
| `PAYMONGO_SECRET_KEY` / `PAYMONGO_WEBHOOK_SECRET` | https://dashboard.paymongo.com/developers (API keys and Webhooks) |
| Where to paste them | https://dashboard.render.com → story-api → Environment |

**Brevo setup.** Verify the sender domain (SPF/DKIM) so codes don't land in spam, create an API key, and set `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`.

## 15. Build Order

1. Database
2. Models
3. Migrations
4. Auth: email + Brevo, then Google
5. Genres and catalog serializers and views
6. Admin Studio and bulk-import endpoints
7. PayMongo service and webhook
8. Flutter scaffolding and auth screens
9. Reader and genre onboarding
10. Admin Studio UI
11. Screen protection
12. Deployment: Render, then Firebase
13. Store packaging

The backend must be fully functional and tested (`python manage.py test`, curl or Postman) before Flutter work depends on it.

## 16. What "Done" Looks Like

- A reader can sign in **with Google or with a Brevo-verified email** on Android, iOS, Windows and the website, and sees the same genres, stories, purchases and theme on all four.
- Readers can switch between Book (swipe/flip pages) and Long page, and the choice follows them across devices.
- Every story shows its views and readers to readers and admins, and total readers is shown site-wide.
- New readers pick genres on first sign-in, and the "For you" shelf and the genre filter bar reflect them.
- A public column's stories, and ₱0 stories, are fully readable without payment.
- A paywalled story shows only its preview (table of contents intact) until the reader pays. After payment, the full content appears automatically.
- An admin can do the full story workflow:
  - create a story in the **Story Studio**: format it with the ribbon, add, split and reorder chapters with the navigation pane, and watch it autosave;
  - tag genres, set the price to ₱49 and the preview to two paragraphs, and publish;
  - immediately see it in the reader app.
- An admin can **bulk-import** a mix of .docx, .md and .txt files with batch and per-file genre tags, and gets one draft story per file with chapters detected.
- The PayMongo QR Ph flow works end-to-end in test mode, and the webhook is signature-verified and idempotent.
- Screenshots and recordings of story screens come out black on Android and excluded on Windows. On iOS recordings are hidden, and on the web the content is covered when focus leaves the page.
- The API runs on Render with Postgres, the website is on Firebase Hosting, and covers are stored in Firebase Storage.
- Release builds are signed and ready for Google Play Console, App Store Connect and Microsoft Partner Center.
- No secrets are committed. `.env.example` documents every variable, and production secrets live only in the Render dashboard.

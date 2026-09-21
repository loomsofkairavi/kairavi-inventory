# Kairavi Inventory

Internal inventory-management tool for Looms of Kairavi (handwoven sarees). This repo hosts the app's static frontend via GitHub Pages; it is **not** the public Looms of Kairavi website (see `loomsofkairavi/lok` for that).

Live app: https://loomsofkairavi.github.io/kairavi-inventory/ (custom domain https://inventory.loomsofkairavi.com/ in progress)

## What it does

Add a saree (colour, weave type, landing cost, photo, notes) and get an auto-generated product ID + QR tag; scan a tag to pull up its record; mark pieces sold or back to available; browse/search/filter the catalog; print or download QR tags; a dashboard of stock by weave type; export the current view (all / available / sold) as a branded PDF catalog.

## How it's built

- Static frontend split across `index.html` (markup), `styles.css`, and `app.js` — plain HTML/CSS/JS, no build step, no framework.
- **Firebase** (`kairavi-inventory` project) provides the backend:
  - **Firestore** for all data (one `sarees` collection).
  - **Authentication** (Email/Password) for login. There is no public sign-up screen anywhere in this app — accounts are provisioned directly in the Firebase console, and only two exist.
  - **Firebase Storage** for photos — uploaded at full resolution (no client-side resize/compression), capped at 20MB per file, stored under `saree-photos/`. Each Firestore record keeps the resulting download URL and storage path.
- The `firebaseConfig` values (apiKey, project id, etc.) visible in `app.js` are not secrets — this is normal for a Firebase web client. Access control is enforced entirely server-side by the Firestore/Storage security rules below, not by hiding this config.

## Security model

- Firestore rules (published): `allow read, write: if request.auth != null;` — any signed-in user can read/write, no one signed out can touch any data.
- Storage rules should mirror this (`allow read, write: if request.auth != null;` on the `saree-photos/` path) so only signed-in users can upload or fetch photos.
- Auth sign-in providers: **Email/Password only** — no Google/OAuth, no anonymous auth, no phone auth.
- No client-side sign-up flow exists in `app.js` (no `createUserWithEmailAndPassword` call) — new accounts can only be created by an admin in the Firebase console.
- Exactly two user accounts exist in Firebase Authentication.

## Updating

Edit `index.html`, `styles.css`, or `app.js` on `main` (directly here on GitHub, or push from a clone) — GitHub Pages rebuilds automatically within about a minute. No separate deploy step.

## Testing

`logic.js` holds the pure, DOM-free and Firebase-free logic (product ID generation, catalog filtering, dashboard math) shared by `app.js`. Open `test.html` directly in a browser to run its unit tests — no build step, no npm, no server needed. A green "N passed, 0 failed" summary at the bottom means it's good. Firebase-dependent behavior (auth, live Firestore/Storage) isn't covered here since this app has no test project — it's exercised by hand against the real `kairavi-inventory` project.

## Files

- `index.html` — markup and screen structure.
- `styles.css` — base styles and variables.
- `logic.js` — pure helper functions (product id, filtering, dashboard math) shared by `app.js` and `test.html`.
- `app.js` — Firebase wiring, auth, catalog, scanning, dashboard, and PDF export logic.
- `test.html` — unit tests for `logic.js`; open in a browser to run.
- `CNAME` — custom domain config for GitHub Pages (auto-managed by the Pages custom domain setting).


# Kairavi Inventory

Internal inventory-management tool for Looms of Kairavi (handwoven sarees). This repo hosts the app's static frontend via GitHub Pages; it is **not** the public Looms of Kairavi website (see `loomsofkairavi/lok` for that).

Live app: https://loomsofkairavi.github.io/kairavi-inventory/ (custom domain https://inventory.loomsofkairavi.com/ in progress)

## What it does

Add a saree (colour, weave type, landing cost, photo, notes) and get an auto-generated product ID + QR tag; scan a tag to pull up its record; mark pieces sold or back to available; browse/search/filter the catalog; print or download QR tags; a dashboard of stock by weave type; export the current view (all / available / sold) as a branded PDF catalog.

## How it's built

- Single static file, `index.html` — plain HTML/CSS/JS, no build step, no framework.
- **Firebase** (`kairavi-inventory` project) provides the backend:
  - **Firestore** for all data (one `sarees` collection).
  - **Authentication** (Email/Password) for login. There is no public sign-up screen anywhere in this app — accounts are provisioned directly in the Firebase console, and only two exist.
  - No Firebase Storage — photos are resized/compressed client-side and stored as base64 data URLs directly in each Firestore document, so no billing plan is required for that piece.
- The `firebaseConfig` values (apiKey, project id, etc.) visible in `index.html` are not secrets — this is normal for a Firebase web client. Access control is enforced entirely server-side by the Firestore security rules below, not by hiding this config.

## Security model

- Firestore rules (published): `allow read, write: if request.auth != null;` — any signed-in user can read/write, no one signed out can touch any data.
- Auth sign-in providers: **Email/Password only** — no Google/OAuth, no anonymous auth, no phone auth.
- No client-side sign-up flow exists in `index.html` (no `createUserWithEmailAndPassword` call) — new accounts can only be created by an admin in the Firebase console.
- Exactly two user accounts exist in Firebase Authentication.

## Updating

Edit `index.html` on `main` (directly here on GitHub, or push from a clone) — GitHub Pages rebuilds automatically within about a minute. No separate deploy step.

## Files

- `index.html` — the live app.
- `CNAME` — custom domain config for GitHub Pages (auto-managed by the Pages custom domain setting).
- `index-old.html` — harmless leftover from an earlier upload; not referenced by anything live, safe to delete.


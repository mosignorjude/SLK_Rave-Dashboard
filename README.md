# SLK Rave Management System

A React, TypeScript and Vite dashboard for event tickets, revenue, expenses, budget, reports and team access. The Firebase setup uses only Authentication, Cloud Firestore and static Firebase Hosting, so it does not deploy Cloud Functions or require the Blaze plan.

## Local setup

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`. Local development defaults to Firebase emulators and uses an isolated `demo-slk-rave-local` project ID.
3. Start the local Authentication and Firestore emulators in one terminal:

   ```sh
   npx -y firebase-tools@latest emulators:start --only auth,firestore --project demo-slk-rave-local
   ```

4. In a second terminal, install dependencies and run `npm run dev`.

Vite development and loopback previews are disconnected from production Firebase. If the emulators are stopped, app sign-in and data actions remain unavailable locally. Emulator use does not require Firebase CLI login.

The web API key and Firebase app identifiers are client configuration, not administrator credentials. Do not place service account keys or other secrets in the frontend.

## Firestore Rules tests

Install the project dependencies, then start the isolated Firestore test emulator in one terminal:

```sh
npm run emulator:rules
```

In a second terminal, run the Rules tests:

```sh
npm run test:rules
```

The Rules test emulator uses the `demo-slk-rave-rules` project ID and port 18080. It does not connect to production Firebase. Stop the emulator with Ctrl+C in the first terminal when the tests finish. If a later start reports that port 18080 is still in use, a Firestore Emulator Java process may still be running; stop that emulator process before restarting.

To test account creation against both Authentication and Firestore, start `npm run emulator:signup` in one terminal and run `npm run test:signup` in another. This uses the same isolated demo project, with Authentication on port 9099 and Firestore on port 18080. The tests create only emulator accounts and documents; stop the emulator with Ctrl+C when finished.

## Spark deployment

The Hosting target is the Firebase project selected by the CLI. `.firebaserc` currently names `slk-rave-db` as the default, so verify the intended Firebase project before every live deployment; do not rely on an unnoticed CLI alias. Sign in with an authorized Firebase CLI account and confirm the target project in the Firebase Console first. Never paste `.env` contents or service-account credentials into logs or the browser build.

Before deployment, configure the `VITE_FIREBASE_*` environment variables in the build environment and set `VITE_USE_EMULATORS=false`. To initialize App Check, set `VITE_FIREBASE_APP_CHECK_SITE_KEY` to the public reCAPTCHA Enterprise site key registered for the same Firebase web app. The site key is public client configuration; keep any reCAPTCHA secret or other credentials in Firebase/Google Cloud Console and out of the client build. If the site key is blank, App Check stays off and the app logs a warning; do not enable App Check enforcement until the site key is set and verified App Check requests are visible in the Firebase Console. Confirm that the project ID and Auth domain belong to the intended Firebase project, then run:

```sh
npm install
npm run build
npx firebase-tools deploy --only firestore:rules,hosting --project <VERIFIED_FIREBASE_PROJECT_ID>
```

Replace the placeholder with the verified project ID; do not run the command with the placeholder. This command publishes the Firestore Rules and the static `dist/` build. It does not deploy Functions. Review `firestore.rules` against the target data first. Production Rules and Hosting deployment have not been verified by this repository task.

The Activity Log combines action, actor UID, resource type, and date filters with `createdAt` ordering. `firestore.indexes.json` declares the required compound index combinations. Deploy and verify those indexes before relying on filtered Activity Log queries in production; local Rules Emulator tests do not verify production index availability. Other ledger queries use collection reads or single-field ordering.

Firebase Authentication email verification is used for the one-time Master Admin claim; account approval and subsequent role assignment are performed by the Admin in the dashboard. Complete the checks in `RELEASE_READINESS.md` before releasing to users.

## First administrator and event setup

The initial Master Admin account must use `carpentersfamily001@gmail.com`. Register with that address, verify it through Firebase's email, then select **I verified — activate Master Admin**. Firestore rules allow this claim only for that verified email and only while the Master Admin marker does not exist. The first Admin session initializes missing ticket and transaction-category documents without overwriting existing records. Admins create the event budget from the Budget page, then add allocation categories.

## Admin continuity and emergency recovery

Keep at least one separate, trusted backup account approved as an Admin. The User Management page warns when it sees no other approved Admin profile, but this is an operational reminder; it cannot guarantee that the other account's owner can sign in. Test the backup account before relying on it. A backup Admin can continue ordinary administration but cannot transfer or replace the protected Master Admin identity.

If the Master Admin cannot sign in, first recover access to the original Firebase Authentication account and its email, then verify the email and sign in again. The app has no Master Admin transfer or recovery button. If the original account cannot be recovered, pause normal client writes and have a Firebase project owner or other authorized operator carry out a reviewed emergency migration from a trusted environment. Back up Firestore first; keep `users/{uid}`, `usersPublic/{uid}`, `settings/masterAdmin`, and the audit trail consistent. If changing the Master Admin email, update the matching value in the application and Firestore Rules as part of the same planned migration. Review and test the rules, then verify the replacement Admin sign-in before resuming normal use. Record the emergency change outside the app's client audit log as well, since privileged operator writes do not use the normal browser flow.

Default capacity is 700 tickets: Early Bird (150 at ₦5,000), Regular (540 at ₦8,000) and VIP Experience (10 at ₦150,000). A budget has a total amount and categories whose percentage allocations calculate whole-Naira amounts. Admins can edit the budget and add, rename, or remove allocations later.

## Security model

Firebase Authentication identifies each user. Firestore rules are the enforcement boundary for profile creation, the one-time Admin bootstrap, Admin-only team and configuration changes, finance ledger access, and ticket sale writes. Ticket sales use Firestore transactions so concurrent sales update inventory atomically; historical sales retain the price captured at the time of sale. Rules deny direct edits to existing ticket sales and activity logs.

The browser communicates directly with Firebase, so no server functions or service account key are used. Privileged actions are limited by authenticated role checks in Firestore Rules, not by UI visibility. Verified Guests, Members, and Executives share the authorized financial read scope and full ticket-sale list. Guests are read-only; Members can record ticket sales only; Admins and Executives retain their existing financial writes. Admins alone can delete financial records. Expenses are recorded as Paid, Pending, or Deposit; no Admin approval is required. New registrations are assigned the Guest role by Firestore Rules; verified email is required before financial reads. Review rules before deploying them to a project with existing data.

Finance audit detail values are generated from transaction reads and Rules validate selected fields, but Spark-only direct client writes cannot prove every optional before/after or snapshot value is truthful. See `firestore-security-review.md` for the verified fields and remaining audit limitations.

Budget enforcement is currently **warn only**. The Budget page counts Paid expenses and Deposit amounts as paid spending, separates Pending expenses as commitments, and keeps legacy Unpaid records as commitments. Expense saves display advisory overrun warnings. These browser warnings do not prevent spending and can be bypassed by direct Firestore writes.

## Current alerts

The bell opens a Spark-compatible view of current ticket inventory and budget thresholds derived from the authenticated user's permitted Firestore data. Firestore listeners update the view while the dashboard is open and connected; cached or unsynced values are labeled. This panel is not a durable notification or event-delivery service: it does not keep per-user read/unread or delete state, and it does not guarantee delivery while the app is closed or disconnected. An alert is informational and is not proof that a ticket sale, payment, approval, or other business action occurred. Verify the current business record and its status.

## Guest access

Guests are authenticated Firebase users. Their profile is assigned the fixed `guest` role at signup, and Firestore Rules require a verified email before they can read authorized financial collections. Guests can view the same financial information as Members and Executives, while Firestore Rules deny Guest writes. The dashboard hides write controls for Guests as a usability measure; the Rules remain authoritative.

## Firestore collections

`users`, `usersPublic`, `usernames`, `ticketTiers`, `ticketSales`, `revenues`, `expenses`, `revenueCategories`, `expenseCategories`, `budgets`, `budgetAllocations`, `activityLogs` and `settings`.

All monetary values are whole Nigerian Naira integers. `.env` is ignored by Git; use `.env.example` as the public configuration template.

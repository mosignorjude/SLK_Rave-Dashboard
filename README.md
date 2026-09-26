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

## Spark deployment

From a Firebase CLI session signed in to the project, run:

```sh
npm install
npm run build
npx firebase-tools deploy --only firestore:rules,hosting
```

Configure the `VITE_FIREBASE_*` environment variables for the Hosting build and set `VITE_USE_EMULATORS=false`. The project deploys static files from `dist/`. Firebase Authentication email verification is used for the one-time Master Admin claim; account approval and subsequent role assignment are performed by the Admin in the dashboard.

## First administrator and event setup

The initial Master Admin account must use `carpentersfamily001@gmail.com`. Register with that address, verify it through Firebase's email, then select **I verified — activate Master Admin**. Firestore rules allow this claim only for that verified email and only while the Master Admin marker does not exist. The first Admin session initializes missing ticket and transaction-category documents without overwriting existing records. Admins create the event budget from the Budget page, then add allocation categories.

Default capacity is 700 tickets: Early Bird (150 at ₦5,000), Regular (540 at ₦8,000) and VIP Experience (10 at ₦150,000). A budget has a total amount and categories whose percentage allocations calculate whole-Naira amounts. Admins can edit the budget and add, rename, or remove allocations later.

## Security model

Firebase Authentication identifies each user. Firestore rules are the enforcement boundary for profile creation, the one-time Admin bootstrap, Admin-only team and configuration changes, finance ledger access, and ticket sale writes. Ticket sales use Firestore transactions so concurrent sales update inventory atomically; historical sales retain the price captured at the time of sale. Rules deny direct edits to existing ticket sales and activity logs.

The browser communicates directly with Firebase, so no server functions or service account key are used. Privileged actions are limited by authenticated role checks in Firestore Rules, not by UI visibility. Admins and Executives can read financial ledgers; Members can record ticket sales; Guests can read ticket tiers. Non-guest users are signed out after 10 minutes without activity. Review rules before deploying them to a project with existing data.

## Firestore collections

`users`, `usersPublic`, `usernames`, `ticketTiers`, `ticketSales`, `revenues`, `expenses`, `revenueCategories`, `expenseCategories`, `budgets`, `budgetAllocations`, `activityLogs` and `settings`.

All monetary values are whole Nigerian Naira integers. `.env` is ignored by Git; use `.env.example` as the public configuration template.

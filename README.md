# SLK Rave Management System

A React, TypeScript and Vite dashboard for event tickets, revenue, expenses, budget, reports and team access. The Firebase setup uses only Authentication, Cloud Firestore and static Firebase Hosting, so it does not deploy Cloud Functions or require the Blaze plan.

## Local setup

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env` and fill in the Firebase web app configuration.
3. In Firebase Console, enable Email/Password sign-in and create a **Cloud Firestore Standard edition** database.
4. Install dependencies and run `npm run dev`.

The web API key and Firebase app identifiers are client configuration, not administrator credentials. Do not place service account keys or other secrets in the frontend.

## Spark deployment

From a Firebase CLI session signed in to the project, run:

```sh
npm install
npm run build
npx firebase-tools deploy --only firestore:rules,hosting
```

Configure the `VITE_FIREBASE_*` environment variables for the Hosting build. The project deploys static files from `dist/`. Firebase Authentication email verification is used for the one-time Master Admin claim; account approval and subsequent role assignment are performed by the Admin in the dashboard.

## First administrator and event setup

The initial Master Admin account must use `carpentersfamily001@gmail.com`. Register with that address, verify it through Firebase's email, then select **I verified — activate Master Admin**. Firestore rules allow this claim only for that verified email and only while the Master Admin marker does not exist. The first Admin session initializes missing event documents without overwriting existing records.

Default capacity is 700 tickets: Early Bird (150 at ₦5,000), Regular (540 at ₦8,000) and VIP Experience (10 at ₦150,000). The initial budget totals ₦5,000,000, allocated to Talent & Booking (₦1,500,000), Venue & Production (₦1,800,000), Marketing & Promo (₦750,000) and Operations & Safety (₦950,000). Admins can adjust prices, capacity and allocations later.

## Security model

Firebase Authentication identifies each user. Firestore rules are the enforcement boundary for profile creation, the one-time Admin bootstrap, Admin-only team and configuration changes, finance ledger access, and ticket sale writes. Ticket sales use Firestore transactions so concurrent sales update inventory atomically; historical sales retain the price captured at the time of sale. Rules deny direct edits to existing ticket sales and activity logs.

The browser communicates directly with Firebase, so no server functions or service account key are used. Privileged actions are limited by authenticated role checks in Firestore Rules, not by UI visibility. Admins and Executives can read financial ledgers; Members can record ticket sales; Guests can read ticket and budget information. Review rules before deploying them to a project with existing data.

## Firestore collections

`users`, `usersPublic`, `usernames`, `ticketTiers`, `ticketSales`, `revenues`, `expenses`, `revenueCategories`, `expenseCategories`, `budgets`, `budgetAllocations`, `activityLogs` and `settings`.

All monetary values are whole Nigerian Naira integers. `.env` is ignored by Git; use `.env.example` as the public configuration template.

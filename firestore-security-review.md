# Firestore security model

These rules are designed for the Spark architecture: Firebase Authentication plus direct web-client access to Cloud Firestore. There is no Admin SDK or trusted Cloud Functions backend in this version.

## Access boundaries

- Every active role requires a signed-in user with a verified email and an approved Firestore profile.
- A user may create only their own pending profile and username. The Master Admin role can be claimed only by the verified `carpentersfamily001@gmail.com` account while the bootstrap marker does not exist.
- Only Admins can approve accounts, change roles, configure tickets and budgets, and manage categories. Budget categories store a percentage and whole-Naira amount; the browser validates that their amounts do not exceed the budget total. The Master Admin profile and marker cannot be changed through the browser after bootstrap.
- Admins and Executives can access finance ledgers. Members can create ticket sales; sales must use the current tier price and atomically match the inventory increment. Sales cannot be edited or deleted.
- Guests can read ticket tiers. Admins and Executives can read budgets and allocations; only Admins can create, update, or remove them. Guests cannot read transaction ledgers or team profiles.
- Activity entries are append-only and tied to the signed-in actor. Only Admins can read the audit collection.
- The final catch-all rule denies all unspecified reads and writes.

## Important limits

Firestore rules validate identity, role, shape, and ticket inventory consistency. They cannot safely perform all aggregate business checks that were previously in Cloud Functions, such as enforcing a budget cap against every expense row. Direct writes therefore rely on trusted, approved finance roles for revenue and expense entry. Client-side checks improve usability but are not security controls.

Review `firestore.rules` against the existing database before deploying. Test with the Firestore Emulator and deploy rules before opening the app to users. Rules have not been deployed to the Firebase project by this code change.

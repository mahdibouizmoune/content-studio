# Optional Content Studio Server Publisher

Off by default. This is separate from the Windows/Mac app and is not required for CSV exports. It needs a continuously running private server, PostgreSQL 13+, Node 22.13+ and Pinterest-approved API access. No cloud service is deployed by the app.

1. Install dependencies with `npm ci` inside this folder. Use a dedicated database and restricted database role. Keep PostgreSQL private. Back up the database and restrict filesystem permissions.
2. Create a separate random 32+ character signing secret. Enter the same secret in Quality Studio and in the server environment. Do not use a Pinterest password or publish the secret in source control.
3. Set environment variables shown in `.env.example`. Provide an account-ID-to-OAuth-token map for approved accounts. Tokens remain on the server, never in batch downloads. Arrange token renewal with the approved OAuth application before expiry.
4. In Pin Publishing, import the final artwork, choose the real synchronized account/board, and explicitly approve each draft. Do NOT schedule it locally or export it for CSV as well.
5. In Quality Studio, supply the durable HTTPS URL containing the exact reviewed image bytes and a future schedule. Download the signed handoff batch. Handed-off drafts are locked in the desktop app to prevent two publishers owning the same job.
6. Transfer the signed batch privately. Run `npm run import -- /absolute/path/batch.json`. Then, after staging tests and approved API access, set `ENABLE_PINTEREST_PUBLISHING=true` and run `npm start`. Use a service supervisor. There is no public HTTP endpoint.
7. Export a signed result with `npm run receipt -- /absolute/path/new-receipt.json`. Import it in Quality Studio to reconcile the desktop state.

## Failure Handling

Every create attempt is claimed durably before contacting Pinterest. Database IDs persist across queue retention and repeated imports. Queues have zero create retries. Network failures, server errors and process crashes after claiming remain `uncertain` or `attempting`, not automatically resubmitted. Inspect the Pinterest account before any manual recovery. A rejected request also requires renewed approval; do not create a new batch to work around an unresolved job. Jobs lacking credentials remain `needs-credentials`; an administrator must fix credentials and reconcile before requeueing.

If a batch cannot be written after the desktop handoff locks drafts, they intentionally remain held. Recover from the signed batch or reconcile with server records; do not remove the lock by editing storage. Source and protocol tests are included in the app repository. Real PostgreSQL/Pinterest integration requires your own staging environment; no external publication is performed during app tests.

Image downloads reject non-public DNS addresses, redirects, oversized/non-image responses and SHA-256 mismatches. Expiring Replicate links are rejected. All Pin fields are immutable in a signed batch; material edits require a new approval after terminal reconciliation. The worker does not scrape Pinterest or bypass developer access requirements.

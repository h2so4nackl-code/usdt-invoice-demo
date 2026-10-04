# Local WDK integration review — 2026-10-04

| Gate | Executed result |
|---|---|
| SIMULATION | PASS — 48/48 tests retained |
| WDK | PASS — official WalletAccountReadOnlyEvm, beta.20; 34/34 integration tests |
| TESTNET LIVE | PASS — existing Sepolia Transfer; CLI and browser, no signing |
| PUBLICATION STATUS | NOT PUBLISHED — local branch and source archive only |

Total: **82/82 runtime tests PASS**, source syntax/bounded secret-pattern scan PASS, npm advisories 0 at all severities. Node 24.16.0, npm 11.13.0. Clean archive reproduction is recorded separately against the finalized archive SHA-256 and commit, avoiding a self-referential archive hash. Linux/macOS execution remains UNVERIFIED; hosted CI was not run.

Baseline was reconfirmed: 48/48 runtime PASS, simulation desktop/mobile (390/320 px) and Windows launcher checked again. Original final archive SHA256: 43588349FBE938FA44DE8686D2D532E96B8A0D3E6A73CA073A9F265BB4ACC38C. Multiple invoice directories were identified: source `usdt-invoice-demo` is the final project; reproduction/final-verification folders are archive test copies. No AGENTS.md applies within this project.

Local main preserves baseline commit e2624063e775e4319803736ee9e4a692b4c3f3d6; integration lives on feature/wdk-testnet-readonly. No Git remote/publication. WDK grant repository was read only for existing verified dependency cache/license text/helper; its working tree and approved HEAD remain unchanged.

## Implemented boundary

Default simulation retains JSON atomic snapshots and its 48 tests. Testnet uses a separate SQLite database, bound to chain/token/recipient. BEGIN IMMEDIATE/COMMIT joins invoice/event/journal changes; rollback tested with an actual failing SQLite trigger. Foreign-key/unique event constraints and serialized asynchronous verification prevent duplicate credit and competing ownership. Restart restores events, journal and unique attribution. Never run two simulation servers over the same JSON file; SQLite transactions support local database serialization, but remote verification should remain one application process.

Each association explicitly supplies invoiceId + transactionHash + logIndex. Stable key is chainId:transactionHash:logIndex; reservation remains assigned even after reorg. Multiple logs are decoded independently. Rechecking a transaction updates/revokes all its already associated events atomically; new unrelated logs are not automatically attributed. The same event cannot be reassigned to another invoice. Amount/confirmations cannot be entered manually in testnet mode.

An event credits only if canonical, at least three confirmations, and its **block timestamp** is within invoice validFrom inclusive / expiresAt exclusive. Out-of-window events are retained visibly with zero credit. Historical demo invoices use explicitly declared historical intervals and do not imply the invoice existed then. Simulation retains its original expiry/late-payment semantics. A refresh of several transactions commits per transaction; if a later request fails, earlier successfully checked transactions remain committed. Last known balances must be interpreted accordingly.

Reorganizations/missing receipts/failed receipts/disappearing logs withdraw existing credit, preserve reserved keys, and journal CREDIT_REVOKED. A returning canonical event restores once. RPC transport/malformed data failures do not delete credit without evidence; they surface sanitized errors and keep last known state. Testnet writes are local SQLite writes only, never RPC/financial writes.

## Executed verification

Final machine-readable results and test totals: evidence/wdk/results.json and tests.txt. **82/82 runtime PASS; simulation 48/48; WDK/testnet 34/34.** Existing 48 tests are retained; testnet tests add real WDK runtime reads through deterministic read-only EIP-1193 fixtures plus receipts, identity/decimals/token checks, multiple logs, duplicates/conflicts, confirmation decreases, all reorg cases, moving anchor, restart, rollback, RPC-secret sanitization, HTTP isolation and unconfigured-mode denial. Fixtures are labeled tests, not live evidence.

Live CLI checked an existing third-party Sepolia Transfer of 20 USDC test and associated/reverified it in a temporary in-memory store. Live browser separately created a historical demo invoice, read the WDK account/token balance, explicitly associated hash/logIndex 4 and showed Achitată at 20 USDC test. Local simulation showed its separate synthetic invoice set. See live.json, browser-export.json and real browser captures under evidence/wdk. Counts/confirmations may differ across reads because the test chain progresses.

Windows launcher first failed due to an escaped comparison in the new Node-version check; the quoting was corrected and launcher rerun successfully. UI default validFrom initialization and mode-change locking during asynchronous reads were corrected during inspection. Live confirmation journal initially displayed undefined arrows; persisted old/new counts and defensive rendering corrected this, with a regression test. No tests were removed. Final browser renders and regression checks were repeated after changes: WDK desktop 1440px, 390px and 320px; simulation desktop and both mobile widths; no horizontal overflow. Baseline copy was also inspected afresh at desktop 1280px, 390px and 320px. Browser error/warning console was empty. Server restart retained the live invoice and its single credit; fresh canonical recheck journal showed actual 90 → 155 confirmations.

Dependency audit returned zero advisories through real npm audit (project-local HTTPS bridge); review inventory and npm-audit.json. Install scripts disabled. The archive omits .env, working databases, node_modules, caches and local audit transport logs. All source/package/lock/docs and curated public test evidence are intended for review; no endorsement/formal audit/mainnet-readiness claim.

Git attributes normalize the committed lockfile to LF. Its publication SHA-256 is A3DC0850D0B432B7693B149E786E53859932F0982052440326FAC3C56D0812FC; the earlier Windows CRLF working copy had F3FC830EC56B823FE0B9C4956CF1F3F0C3530B04192BA24D95276D38F6C621CB. Only line endings differ; versions/integrities are unchanged. The evidence hash was corrected to the committed/extracted lockfile before final packaging.

Publication status: **LOCAL ONLY — NOT PUBLISHED**. Mainnet, signatures, transfers, deployment, real funds, real credentials and grant submissions: **0**.

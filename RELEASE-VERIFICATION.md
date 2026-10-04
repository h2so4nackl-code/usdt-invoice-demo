# Publication verification — 2026-10-04

Publication and Windows/Ubuntu GitHub Actions are explicitly authorized by the owner. Source-only repository: h2so4nackl-code/usdt-invoice-demo. No dashboard hosting, mainnet, signing, real funds, upstream issue or grant submission is included.

Baseline rechecked at full commit 116bb142263f975c2a64b42ecdc963ae35d7b9dd: branch feature/wdk-testnet-readonly, clean working tree, no remote; npm test 82/82 PASS (simulation 48, WDK 34), npm run check PASS. Historical live evidence and installed beta.20 match recorded files. The original WDK sandbox remains clean at 3128e6f2353a815d10ea96f9580042435033416f.

## Publication review

Every reachable Git blob/path and all commit author/committer/message metadata were scanned. Initial history: 3 commits, 67 blobs, no findings. The guard is reproducible using `npm run scan:history` in a full Git checkout. It checks excluded files, private-key headers, selected credential patterns, secret-bearing URLs, personal paths and unexpected emails; diagnostics never echo matching secret values. It is a bounded scan, not a formal security audit or guarantee of detecting every secret. A real historical secret would block publication rather than be silently removed.

All 13 tracked screenshots were visually reviewed: synthetic clients/local simulation, or public third-party Sepolia data; no desktop chrome, usernames, RPC URLs/keys or private material. Curated exports and structured JSON/test summaries were inspected. No archives, SQLite databases, .env, node_modules, caches or raw transport/debug logs are tracked. Public .env.example uses an uncredentialed public RPC and an explicitly public third-party recipient. The RPC error marker in tests is deliberately synthetic, not a credential.

README and package description distinguish simulated USDt from **Circle USDC test on Sepolia**. Apache-2.0 text and third-party notices are included; no Tether/Circle affiliation or endorsement is claimed. Upstream beta status, RPC trust, explicit reconciliation/last-known state, three-confirmation demo threshold and historical-invoice limitations remain visible.

## CI and evidence

Workflow conformance.yml runs on main pushes, pull requests and manual dispatch, with full-history checkout, pinned actions, Node 24.16.0, Windows and Ubuntu 26.04, read-only repository permissions, disabled persisted credentials and a 10-minute job limit. Install uses npm ci --ignore-scripts --omit=optional. Tests and source/history checks require no public RPC or secrets. No service deployment or artifact upload occurs. Supported runner label was verified against the official actions/runner-images repository and GitHub hosted-runner documentation.

The README badge links to actual GitHub Actions results; it is not a live-payment/RPC badge. Actual final run/commit/job URLs and clean-archive reproduction hashes are recorded separately after execution, avoiding self-referential commit or archive hashes. Historical INTEGRATION-RESULTS.md, PUBLICATION-AUDIT.md and evidence/wdk/results.json describe the preceding local candidate; their no-publication statements apply to that historical phase.

Fresh archive reproduction must pass before first push. Final remote main must equal the tested local commit; no force push or alteration of another repository is permitted. Live checks remain independently executed/dated evidence, never inferred from successful offline CI.

# Local publication candidate audit — 2026-10-04

**LOCAL ONLY — NOT PUBLISHED.** Source is on feature/wdk-testnet-readonly; main preserves the accepted simulation baseline. No remote, hosted CI, issue, grant submission or package publication was created. This project is separate from WDK Agent Payment Sandbox.

| Finding | Classification | Action / evidence |
|---|---|---|
| Official SDK beta.20 pinned; lock integrity on all 102 installed dependencies | SAFE | package-lock.json, package-metadata.json, dependencies.json |
| Registry advisories: all severities zero | SAFE | Actual npm audit response in evidence/wdk/npm-audit.json; not a formal security audit |
| Public Sepolia transaction, contract and third-party recipient | SAFE | Exact provenance in RESEARCH-WDK.md; deliberately public, no ownership claim |
| Synthetic fixture addresses, hashes and RPC-secret marker | SAFE | tests/testnet.test.mjs; not keys or credentials, no signing material |
| .env.example | SAFE | Only public endpoint/address; real secrets unnecessary and prohibited for this demo |
| .env, databases, caches, node_modules, raw temporary transport logs | SAFE after exclusion | .gitignore; source archive generated from tracked Git snapshot, no working data bundled |
| Usernames, machine paths, private contact details in intended source/evidence | SAFE after inspection | Source/docs/evidence searched; browser screenshots and curated JSON contain only local loopback URL and public test data |
| Old verification document could be mistaken for current status | SAFE after correction | VERIFICARI.md explicitly marked historical v0.1.0; original technical evidence retained |
| Optional PowerShell read-only RPC transport | WARN | Already installed runtime required; HTTPS validation remains active, no OS network/proxy change; fetch remains default |
| Testnet ledger depends on one configured RPC, explicit refresh and a 3-confirmation demo threshold | WARN | Trust/finality/stale-snapshot limitations documented; no consensus proof or production payment claim |
| SQLite on Node 24, WDK beta and platforms not executed here | WARN | Windows executed; Ubuntu CI prepared locally only, Linux/macOS execution UNVERIFIED |
| Apache-2.0 project license candidate | WARN | Standard license/third-party notices included; owner must confirm authorship/rights and publication approval |

No demonstrated publication-secret blocker was found in the intended files. Checks are bounded source/credential-pattern searches plus manual artifact review, not a comprehensive certified secret or security audit. The mainnet/private-key/signing paths are absent from the supported integration; server only exposes explicit local read/reconciliation operations.

Before any later publication: approve rights/contact/repository destination, repeat audit/tests on the exact snapshot, and review staged files. No public actions are authorized in this phase.

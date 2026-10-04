# USDt Invoice Demo · WDK read-only

Dashboard local în română pentru facturi și reconciliere. **Simularea este implicită.** Un mod separat verifică evenimente ERC-20 reale de **Sepolia, numai în citire**, folosind Tether WDK oficial.

**Tokenul testnet este USDC de test publicat de Circle, NU USDt oficial.** Fără seed, chei private, signer, transferuri, deployment, mainnet sau fonduri reale. Destinatarul exemplului este o adresă publică terță, nu un wallet al proiectului. WDK Agent Payment Sandbox rămâne nemodificat.

## Pornire Windows

Necesită **Node.js 24+**, verificat cu 24.16.0/npm 11.13.0. Din folderul extras:

```powershell
npm ci --ignore-scripts --omit=optional
.\Porneste-demo.cmd
```

Deschide http://127.0.0.1:4318. Fereastra terminalului rămâne deschisă; Ctrl+C oprește serverul. Prima instalare necesită internet sau un cache npm local pregătit. După instalare, simularea și toate testele independente funcționează offline. Nu se instalează software sistem automat. Arhiva nu include node_modules/cache/date de lucru; facturile încep goale.

```powershell
npm start
npm test
npm run test:simulation
npm run test:wdk
npm run check
```

## Simulare implicită

Client sintetic, sumă exactă până la 6 zecimale, expirare; stări În așteptare, În confirmare, Parțială, Achitată, Expirată. BigInt în micro-unități, șiruri exacte în JSON. Plăți parțiale/excedent, duplicate ignorate, modificarea confirmărilor fără dublare și retragerea creditului sub prag. Punct la introducere, virgulă la afișare. Maximum 18 cifre înainte de punct; fără rotunjire sau calcule monetare cu Number.

Simularea păstrează comportamentul v0.1.0: o plată confirmată integral poate achita și o factură expirată; confirmările se introduc manual. Datele sunt în data/ledger.json, salvate atomic. Nu rula două procese de simulare simultan peste același fișier.

## WDK · testnet · read-only

1. Copiază `.env.example` în `.env`. Exemplul conține numai endpoint public și destinatar public verificat; nu introduce seed/chei private sau credențiale reale. Poți utiliza variabile de mediu în locul fișierului.
2. Repornește serverul. Selectează „WDK · testnet · read-only” în interfață. Nu se efectuează RPC în simularea implicită; configurarea stocării testnet nu înseamnă o citire de rețea.
3. „Verifică WDK și profilul” verifică chainId, bytecode, decimals și citește adresa/soldul ERC-20 prin WalletAccountReadOnlyEvm.
4. Creează o factură testnet separată, cu interval validFrom–expiresAt explicit.
5. Introdu hash-ul tranzacției Sepolia și **logIndex**. Asocierea cu factura selectată este explicită. Nu deducem factura numai din sumă/adresă și nu selectăm automat un log dintre mai multe.
6. „Reverifică evenimentele asociate” citește din nou blocurile/logurile și poate retrage credit după reorganizare. Maximum 20 tranzacții per refresh; peste limită verifică individual.

RPC-ul este configurat exclusiv pe server: WDK_RPC_URL (HTTPS), WDK_RPC_TRANSPORT (fetch implicit; opțional powershell), WDK_RECIPIENT (adresă publică). Nu acceptăm URL-uri din browser. Endpointul/parametrii secreți nu sunt returnați în erori, exporturi sau capturi. Un transport read-only permite numai eth_chainId, eth_blockNumber, eth_getCode, eth_call, eth_getTransactionReceipt și eth_getBlockByNumber; send/sign sunt respinse.

În mediul de verificare Node HTTPS a fost restricționat. Am folosit transportul opțional PowerShell 7 deja disponibil:

```powershell
$env:WDK_RPC_TRANSPORT='powershell'
npm start
```

Acesta forwardează numai citirile HTTPS server-configurate, cu stdin, limite și timeout, fără modificarea proxy-ului/certificatelor/setărilor Windows. Nu instala PowerShell automat; dacă nu este disponibil, păstrează fetch într-un mediu cu HTTPS funcțional. `.env` nu se distribuie și nu se comite.

### Profil verificat

- Ethereum Sepolia: chainId **11155111**, verificat la fiecare operație live.
- Contract **USDC de test**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, din tabelul oficial Circle; decimals **6**, verificate prin RPC.
- WalletAccountReadOnlyEvm oficial din **@tetherto/wdk-wallet-evm 1.0.0-beta.20**, versiune exactă și lockfile. WDK este beta; nu pretindem stabilitate de producție sau endorsement.
- Prag demonstrativ: **3** confirmări, nu garanție de finalitate economică.

Proveniență exactă și surse: [RESEARCH-WDK.md](RESEARCH-WDK.md). WDK citește adresa/soldul; reconcilierea și validarea proaspătă a receipt-ului/logurilor/blocului sunt codul nostru RPC read-only. WDK are și API-uri de receipt; nu pretindem că acestea lipsesc sau că WDK realizează întreaga reconciliere.

### Dovadă live existentă

```text
Transaction: 0x995f95f890140017d7c8a99c32a9eb275f64a68695fe9fff0eab974e5fdb685a
LogIndex: 4
Recipient: 0xe969a25b358325cd9db8fbdfc68e19f6b1709fcd
Amount: 20000000 micro-units = 20 USDC test
Block: 11843617
Block timestamp: 2026-10-04T17:43:48.000Z
```

[Explorer public](https://eth-sepolia.blockscout.com/tx/0x995f95f890140017d7c8a99c32a9eb275f64a68695fe9fff0eab974e5fdb685a). Pentru exemplul din UI, definește explicit un interval local care include timestamp-ul (ex. 04 octombrie 2026 00:00 până la 05 octombrie 23:59) și suma 20. Nu afirmăm că acea factură exista la momentul tranzacției, că destinatarul ne aparține sau că am inițiat plata. Reproducerea live necesită internet și disponibilitatea datelor istorice:

```powershell
npm run verify:live
```

Rezultatul real este în [live.json](evidence/wdk/live.json). Scriptul folosește un store temporar în memorie; nu modifică facturile tale și nu semnează nimic. Dacă RPC/evenimentul nu mai este disponibil, raportează BLOCKED, fără date fabricate.

## Reguli de reconciliere

Cheie unică: **chainId + transactionHash + logIndex**. Aceasta rămâne rezervată primei facturi asociate, inclusiv după reorg. Receipt status=1, contract emitter exact, topic Transfer/ABI valid, destinatar corect, sumă uint256 pozitivă. Canonical block hash este verificat de două ori. Confirmări = head − inclusion block + 1.

Credit testnet numai când timestamp-ul **blocului**, nu timpul observației HTTP, aparține intervalului validFrom inclusiv / expiresAt exclusiv. Evenimentele în afara intervalului rămân vizibile fără credit. Atingerea pragului reduce restul; scăderea confirmărilor sau dispariția evenimentului poate readuce factura în stare neplătită. Verificarea unui hash actualizează toate evenimentele deja asociate din acel hash, fără asocierea automată a logurilor noi.

Datele testnet sunt în data/testnet.sqlite: facturi, evenimente și jurnal actualizate tranzacțional, WAL, synchronous FULL, foreign keys și index unic. Profilul chain/token/recipient este legat de bază; schimbarea destinatarului peste aceeași bază este respinsă. Exportă și folosește un alt folder/profil local pentru un destinatar diferit; aplicația nu șterge automat datele.

Reverificarea mai multor hash-uri comite separat fiecare tranzacție; o eroare ulterioară nu anulează verificările precedente. Erorile RPC păstrează ultima stare reușită și sunt vizibile. Reorganizările sunt detectate la verificare explicită, nu printr-un watcher permanent. Acesta nu este un light client sau o dovadă criptografică de consens; RPC rămâne o limită de încredere.

## Dovezi și structură

[Teste și rezultate](INTEGRATION-RESULTS.md), [inventar dependențe](evidence/wdk/dependencies.json), [audit npm real](evidence/wdk/npm-audit.json). **82/82 teste PASS: 48 originale + 34 WDK/testnet.** Suitele offline folosesc WDK oficial cu provider determinist; live.json și capturile sunt verificări distincte pe rețeaua reală de test. Nu confundăm fixture-urile cu tranzacții live.

Capturi reale: [desktop WDK](evidence/wdk/desktop.jpg), [390px WDK](evidence/wdk/phone-390.jpg), [320px WDK](evidence/wdk/phone-320.jpg), [simulare desktop](evidence/wdk/simulation-desktop.jpg). Fără imagini generate sau date blockchain fabricate.

```text
src/ledger.mjs          Simulare originală și BigInt
src/testnet-rpc.mjs     Profil Sepolia și transport RPC fără scrieri
src/wdk-readonly.mjs    WDK read-only, receipt/log/canonical validator
src/testnet-store.mjs   SQLite, reconciliere, reorg și jurnal atomic
src/server.mjs         Loopback API, moduri separate
public/                UI română responsive
scripts/live-check.mjs Dovadă live read-only separată
tests/                 Baseline + WDK/RPC/SQLite/HTTP adversarial
evidence/wdk/          Rezultate actuale, metadate, capturi și export
```

## Publicare și limite

Branch local **feature/wdk-testnet-readonly**, baseline păstrat pe main. Nicio publicare sau grant submission. Arhiva de surse exclude .git, .env, date/SQLite, node_modules, cache și loguri locale. License Apache-2.0 candidat; [notices](THIRD-PARTY-NOTICES.md). Owner-ul confirmă drepturi și contact înainte de publicare. Fără endorsement Tether/Circle, audit formal, certificare sau mainnet readiness.

Server loopback, Host/Origin și Content-Type validate, CSP, corp de cerere limitat, textContent în UI. Numai date sintetice pentru facturi și adrese/tranzacții publice de test pentru citiri. Fără autentificare multi-user, servicii financiare sau expunere publică. Nu instala/folosi seed, chei, wallet extensions ori RPC credentials reale pentru acest demo.

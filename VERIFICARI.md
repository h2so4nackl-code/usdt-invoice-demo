# Verificări locale — 2026-10-04

## Proveniență și izolare

Arhiva `usdt-invoice-demo-v0.1.0.zip` nu a fost găsită în workspace, Downloads, Desktop, Documents sau folderul de atașamente verificat. Proiectul a fost reconstruit separat în `usdt-invoice-demo`. Nu există o suită preexistentă în această copie; afirmația anterioară „18/18” nu este preluată ca rezultat. Proiectul WDK nu a fost modificat.

## Verificări automate

Prima rulare: **45/46 PASS**, cu un test de Host incorect: clientul fetch nu a transmis antetul suprascris. Testul a fost înlocuit cu un request HTTP care transmite efectiv Host-ul ostil; serverul îl respinge cu 403. Scanerul a detectat fals propria expresie de cheie; expresia a fost restrânsă la delimitatoare reale. A doua rulare: **46/46 PASS**, verificare sintaxă/tipare PASS.

Au fost adăugate ulterior două teste pentru sume JSON stocate ca numere și capacitatea jurnalului; modelul respinge datele imprecise și scrierile când jurnalul este plin. Rezultatul final și reproducerea din arhivă sunt consemnate în `evidence/final-results.json` și `evidence/tests-final.txt`, fără a inventa rezultate neexecutate.

Acoperire: BigInt și maximum 6 zecimale, valori invalide, toate cele cinci stări, plăți parțiale și excedent, duplicat, actualizare/scădere confirmări, conflict ID, profil greșit, expirare/platǎ tardivă, câmpuri/getteri ostili, eșec persistare fără commit, reload, stocare coruptă, API HTTP, Host/Origin/JSON/corp, CSP și export.

## Browser real — pași efectiv executați

| Scenariu | Rezultat observat |
|---|---|
| Creare desktop | Atelier Demo SRL, 125.500001 USDt, În așteptare |
| Plată neconfirmată | sim-ui-001, 40.25 USDt, 0 confirmări: În confirmare, credit 0 |
| Confirmare parțială | 3 confirmări: Parțială, confirmat 40.25, rest 85.250001 |
| Duplicat | Aceleași 3 confirmări: mesaj „Duplicat ignorat”, sold și observații neschimbate |
| Scădere confirmări | 3 → 1: În confirmare, credit 0, rest 125.500001 |
| Achitare și excedent | Revenire la 3 și sim-ui-002 de 90.250001: Achitată, confirmat 130.500001, excedent 5 |
| Expirare reală | Factură Client Expirare Demo de 75, termen aproximativ 15 secunde: În așteptare → Expirată fără modificare de ceas |
| Export din UI | Click Export JSON, fișier descărcat și verificat: simulation=true, 2 facturi, credit 130.500001, excedent 5, 7 evenimente. Copie în evidence/export-browser.json |
| Telefon 390×844 | Creare Studio Mobil Demo de 250 și plată sim-mobile-001 de 100 cu 3 confirmări: Parțială, rest 150 |
| Telefon 320×740 | Fără overflow orizontal. Corectată dimensiunea fontului pentru a păstra suma de 6 zecimale lizibilă |
| Consolă browser | Nicio intrare error/warn returnată la verificarea finală |
| Porneste-demo.cmd | Executat efectiv cu PORT=4319; răspuns HTTP verificat separat de serverul de la 4318 |

Capturile sunt JPEG reale din browser, fără generare/editare de imagini: desktop.jpg, phone-summary.jpg, phone-390.jpg și phone-320.jpg. Mobile este emulare de viewport, nu test pe un telefon fizic. Nu s-au testat toate browserele sau tehnologii asistive. Setarea temporară de viewport a fost resetată.

## Limite ale dovezilor

Exportul păstrează momentul descărcării; capturile finale arată trei facturi după scenariul suplimentar pe telefon. Acesta este un set de date sintetic de verificare, nu o afirmație de integrare financiară. Arhiva exclude data/, cache, node_modules și fișiere .env; pornește de la zero. Testarea în browser a fost realizată prin interacțiuni cu UI, nu o suită Playwright redistribuită.

Nicio integrare WDK, wallet, testnet sau mainnet. Fonduri reale, chei/seed, publicări și aplicații trimise: **0**.

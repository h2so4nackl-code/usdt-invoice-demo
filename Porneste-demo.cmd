@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 sau mai nou este necesar. Nu se instaleaza nimic automat.
  pause
  exit /b 1
)
echo USDt Invoice Demo - SIMULARE, fara fonduri reale.
if not defined PORT set "PORT=4318"
echo Deschide http://127.0.0.1:%PORT% in browser dupa mesajul de pornire.
echo Opreste serverul cu Ctrl+C. Datele sunt salvate local in data\ledger.json.
node src\server.mjs
if errorlevel 1 pause

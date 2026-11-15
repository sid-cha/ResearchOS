@echo off
cd /d "%~dp0"
if not exist .env (
  echo Copy .env.example to .env and add Alpaca keys before using live data.
  echo DEMO mode still works without credentials.
)
node --env-file-if-exists=.env server.mjs
pause

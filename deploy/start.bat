@echo off
title Video Tracker Realtime - Server
chcp 65001 >nul
cls
set PORT=3333
echo ======================================================
echo    HE THONG THEO DOI VIDEO REALTIME (DEPLOY PACK)
echo ======================================================
echo.
if not exist node_modules (
  echo [*] Phat hien lan chay dau tien, dang cai dat dependencies...
  call npm install --omit=dev
  echo [*] Cai dat trinh duyet Chromium cho Playwright...
  call npx playwright install chromium
)
if exist ngrok.exe (
  echo [*] Khoi dong ngrok voi domain co dinh...
  start cmd /k "title Ngrok Tunnel && ngrok.exe http --domain=fiber-decree-amuser.ngrok-free.dev 3333"
)
echo [*] Dang khoi dong Backend NestJS tai cong 3333...
echo 👉 Truy cap web tai: http://localhost:3333 hoac qua ngrok domain.
echo.
node dist/main.js
pause

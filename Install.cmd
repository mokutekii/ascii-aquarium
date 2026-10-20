@echo off
rem Double-click this file to install ASCII Aquarium.
cd /d "%~dp0"
title ASCII Aquarium setup
where node >nul 2>nul
if errorlevel 1 (
  echo ASCII Aquarium needs a free program called Node.js, and it is not installed yet.
  echo.
  echo 1. A download page will open. Click the big "LTS" button and install it ^(just keep clicking Next^).
  echo 2. When it finishes, double-click Install.cmd again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Setting up ASCII Aquarium. This takes about a minute and needs internet once...
echo.
node install.cjs
if errorlevel 1 (
  echo.
  echo Something went wrong. The messages above say what. You can also ask a friend to help.
  pause
  exit /b 1
)
echo.
echo All set! Opening the aquarium now. Next time, use the "ASCII Aquarium" icon on your Desktop or in the Start menu.
call node start.cjs
pause

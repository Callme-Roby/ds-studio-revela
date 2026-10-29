@echo off
rem Double-clic : installe si besoin, compile, demarre DS-Studio et ouvre le navigateur.
title DS-Studio
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12+ est necessaire : https://nodejs.org/en/download
  echo Installez-le, puis double-cliquez de nouveau sur "Lancer DS-Studio".
  start "" "%~dp0launcher\INSTALLATION.html"
  pause
  exit /b 1
)
node scripts\start-direct.mjs
if errorlevel 1 pause

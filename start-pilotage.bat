@echo off
cd /d "%~dp0"
node --use-system-ca server.js
pause

@echo off
cd /d "%~dp0"
echo ScopeProof opens at http://127.0.0.1:4317
echo Stop with Ctrl+C. Default mode uses simulated invoices.
call npm start
pause

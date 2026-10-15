@echo off
cd /d "%~dp0backend"
node --version >nul 2>&1
if errorlevel 1 (
  echo Instale Node.js 24 o posterior y vuelva a abrir este archivo.
  pause
  exit /b 1
)
node -e "if(24 > Number(process.versions.node.split('.')[0])) process.exit(1)"
if errorlevel 1 (
  echo Se requiere Node.js 24 o posterior para SQLite integrado.
  pause
  exit /b 1
)
call npm ci --no-audit --no-fund
if errorlevel 1 (
  pause
  exit /b 1
)
echo Abra http://localhost:8000 en Chrome y Edge.
call npm start
pause

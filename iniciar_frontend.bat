@echo off
cd /d "%~dp0frontend"
call flutter pub get
if errorlevel 1 exit /b 1
call flutter run -d web-server --web-hostname localhost --web-port 8080 --dart-define=API_BASE_URL=http://localhost:8000

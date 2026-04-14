@echo off
cd /d "%~dp0"

:: ── Configure this ──────────────────────────────────────────────
set NGINX_DIR=C:\nginx
:: ────────────────────────────────────────────────────────────────

:: Reload nginx if already running, otherwise start it
tasklist /fi "imagename eq nginx.exe" 2>NUL | find /i "nginx.exe" >NUL
if errorlevel 1 (
    echo Starting nginx...
    start "" /D "%NGINX_DIR%" "%NGINX_DIR%\nginx.exe"
) else (
    echo Reloading nginx...
    "%NGINX_DIR%\nginx.exe" -s reload
)

:: Restart Flask API server if already running, otherwise start it
tasklist /fi "imagename eq pythonw.exe" 2>NUL | find /i "pythonw.exe" >NUL
if errorlevel 1 (
    echo Starting MM API server...
) else (
    echo Restarting MM API server...
    taskkill /f /im pythonw.exe >NUL
)
start "" /D "%~dp0" pythonw server.py

echo Done.

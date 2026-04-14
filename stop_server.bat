@echo off

:: Stop Flask API server
tasklist /fi "imagename eq pythonw.exe" 2>NUL | find /i "pythonw.exe" >NUL
if errorlevel 1 (
    echo MM API server was not running.
) else (
    taskkill /f /im pythonw.exe >NUL
    echo MM API server stopped.
)

:: Stop nginx
tasklist /fi "imagename eq nginx.exe" 2>NUL | find /i "nginx.exe" >NUL
if errorlevel 1 (
    echo nginx was not running.
) else (
    taskkill /f /im nginx.exe >NUL
    echo nginx stopped.
)

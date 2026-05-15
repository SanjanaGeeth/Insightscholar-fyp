@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "CONFIG_FILE=%ROOT%\run_insightscholar.config"
set "RUNLOG_DIR=%ROOT%\tmp\runlogs"
set "BACKEND_PID_FILE=%RUNLOG_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%RUNLOG_DIR%\frontend.pid"
set "BACKEND_OUT_LOG=%RUNLOG_DIR%\backend.out.log"
set "BACKEND_ERR_LOG=%RUNLOG_DIR%\backend.err.log"
set "FRONTEND_OUT_LOG=%RUNLOG_DIR%\frontend.out.log"
set "FRONTEND_ERR_LOG=%RUNLOG_DIR%\frontend.err.log"

call :ensureConfig
call :loadConfig
set "CLI_MODE=0"
if /I "%~1"=="start" set "CLI_MODE=1" & goto start
if /I "%~1"=="stop" set "CLI_MODE=1" & goto stop
if /I "%~1"=="restart" set "CLI_MODE=1" & goto restart
if /I "%~1"=="ports" set "CLI_MODE=1" & goto editports
if /I "%~1"=="status" set "CLI_MODE=1" & goto status

:menu
cls
echo ==============================================
echo   InsightScholar App Manager
echo ==============================================
echo.
echo   Backend Port : %BACKEND_PORT%
echo   Frontend Port: %FRONTEND_PORT%
echo.
echo   [S] Start app
echo   S[t]op app
echo   [R] Restart app
echo   [E] Edit ports
echo   [U] Status
echo   [Q] Quit
echo.
choice /c STERUQ /n /m "Choose an option: "
if errorlevel 6 goto end
if errorlevel 5 goto status
if errorlevel 4 goto editports
if errorlevel 3 goto restart
if errorlevel 2 goto stop
if errorlevel 1 goto start
goto end

:start
call :loadConfig
call :ensureDirs
call :startBackend
call :startFrontend
echo.
echo App launch requested.
echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend : http://localhost:%BACKEND_PORT%
echo Logs    : %RUNLOG_DIR%
echo.
call :afterAction

:stop
call :stopProcess "%BACKEND_PID_FILE%" "backend"
call :stopProcess "%FRONTEND_PID_FILE%" "frontend"
echo.
call :afterAction

:restart
call :stopProcess "%BACKEND_PID_FILE%" "backend"
call :stopProcess "%FRONTEND_PID_FILE%" "frontend"
call :ensureDirs
call :startBackend
call :startFrontend
echo.
echo Restart requested.
echo.
call :afterAction

:editports
call :loadConfig
echo.
set /p NEW_BACKEND_PORT=Enter backend port [%BACKEND_PORT%]: 
if not "%NEW_BACKEND_PORT%"=="" set "BACKEND_PORT=%NEW_BACKEND_PORT%"
set /p NEW_FRONTEND_PORT=Enter frontend port [%FRONTEND_PORT%]: 
if not "%NEW_FRONTEND_PORT%"=="" set "FRONTEND_PORT=%NEW_FRONTEND_PORT%"
call :saveConfig
echo Saved ports: backend=%BACKEND_PORT%, frontend=%FRONTEND_PORT%
echo.
call :afterAction

:status
call :printStatus "%BACKEND_PID_FILE%" "backend"
call :printStatus "%FRONTEND_PID_FILE%" "frontend"
echo.
echo Frontend URL: http://localhost:%FRONTEND_PORT%
echo Backend URL : http://localhost:%BACKEND_PORT%
echo Logs        : %RUNLOG_DIR%
echo.
call :afterAction

:afterAction
if "%CLI_MODE%"=="1" goto end
pause
goto menu

:end
endlocal
exit /b 0

:ensureConfig
if exist "%CONFIG_FILE%" exit /b 0
(
  echo BACKEND_PORT=8000
  echo FRONTEND_PORT=3000
) > "%CONFIG_FILE%"
exit /b 0

:loadConfig
for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG_FILE%") do (
  if /I "%%A"=="BACKEND_PORT" set "BACKEND_PORT=%%B"
  if /I "%%A"=="FRONTEND_PORT" set "FRONTEND_PORT=%%B"
  if /I "%%A"=="SERPAPI_API_KEY" set "SERPAPI_API_KEY=%%B"
)
if not defined BACKEND_PORT set "BACKEND_PORT=8000"
if not defined FRONTEND_PORT set "FRONTEND_PORT=3000"
if not defined SERPAPI_API_KEY set "SERPAPI_API_KEY="
exit /b 0

:saveConfig
(
  echo BACKEND_PORT=%BACKEND_PORT%
  echo FRONTEND_PORT=%FRONTEND_PORT%
  echo SERPAPI_API_KEY=%SERPAPI_API_KEY%
) > "%CONFIG_FILE%"
exit /b 0

:ensureDirs
if not exist "%RUNLOG_DIR%" mkdir "%RUNLOG_DIR%"
exit /b 0

:startBackend
set "UVICORN_EXE=%APPDATA%\Python\Python313\Scripts\uvicorn.exe"
if not exist "%UVICORN_EXE%" (
  echo Could not find uvicorn.exe at "%UVICORN_EXE%".
  echo Install backend requirements first.
  exit /b 1
)
if exist "%BACKEND_OUT_LOG%" del /f /q "%BACKEND_OUT_LOG%" >nul 2>nul
if exist "%BACKEND_ERR_LOG%" del /f /q "%BACKEND_ERR_LOG%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='%ROOT%'; $pidFile='%BACKEND_PID_FILE%'; $out='%BACKEND_OUT_LOG%'; $err='%BACKEND_ERR_LOG%'; $exe='%UVICORN_EXE%'; $env:SERPAPI_API_KEY='%SERPAPI_API_KEY%'; $proc = Start-Process -FilePath $exe -ArgumentList 'app.main:app','--host','0.0.0.0','--port','%BACKEND_PORT%','--app-dir','backend' -WorkingDirectory $root -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path $pidFile -Value $proc.Id"
if exist "%BACKEND_PID_FILE%" (
  set /p BACKEND_PID=<"%BACKEND_PID_FILE%"
  echo Backend start requested ^(PID !BACKEND_PID!^)
) else (
  echo Failed to record backend PID.
)
exit /b 0

:startFrontend
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
if not exist "%NPM_CMD%" set "NPM_CMD=npm.cmd"
if exist "%FRONTEND_OUT_LOG%" del /f /q "%FRONTEND_OUT_LOG%" >nul 2>nul
if exist "%FRONTEND_ERR_LOG%" del /f /q "%FRONTEND_ERR_LOG%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root='%ROOT%\frontend'; $pidFile='%FRONTEND_PID_FILE%'; $out='%FRONTEND_OUT_LOG%'; $err='%FRONTEND_ERR_LOG%'; $npm='%NPM_CMD%'; $env:PORT='%FRONTEND_PORT%'; $env:BROWSER='none'; $env:REACT_APP_API_URL='http://localhost:%BACKEND_PORT%/api/v1'; $proc = Start-Process -FilePath $npm -ArgumentList 'start' -WorkingDirectory $root -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path $pidFile -Value $proc.Id"
if exist "%FRONTEND_PID_FILE%" (
  set /p FRONTEND_PID=<"%FRONTEND_PID_FILE%"
  echo Frontend start requested ^(PID !FRONTEND_PID!^)
) else (
  echo Failed to record frontend PID.
)
exit /b 0

:stopProcess
set "PID_FILE=%~1"
set "PROC_NAME=%~2"
if not exist "%PID_FILE%" (
  echo No %PROC_NAME% PID file found.
  exit /b 0
)
set /p TARGET_PID=<"%PID_FILE%"
if "%TARGET_PID%"=="" (
  del /f /q "%PID_FILE%" >nul 2>nul
  echo No %PROC_NAME% PID stored.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %TARGET_PID% -ErrorAction SilentlyContinue) { Stop-Process -Id %TARGET_PID% -Force }" >nul
if exist "%PID_FILE%" del /f /q "%PID_FILE%" >nul 2>nul
echo %PROC_NAME% stop requested ^(PID %TARGET_PID%^)
exit /b 0

:printStatus
set "PID_FILE=%~1"
set "PROC_NAME=%~2"
if not exist "%PID_FILE%" (
  echo %PROC_NAME%: not running ^(no PID file^)
  exit /b 0
)
set /p TARGET_PID=<"%PID_FILE%"
if "%TARGET_PID%"=="" (
  echo %PROC_NAME%: unknown
  exit /b 0
)
for /f %%S in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id %TARGET_PID% -ErrorAction SilentlyContinue) { ''running'' } else { ''stopped'' }"') do set "PROC_STATE=%%S"
echo %PROC_NAME%: %PROC_STATE% ^(PID %TARGET_PID%^)
if /I "%PROC_STATE%"=="stopped" del /f /q "%PID_FILE%" >nul 2>nul
exit /b 0

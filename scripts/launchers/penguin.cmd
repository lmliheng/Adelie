@echo off
rem penguin CLI launcher, installed as bin\penguin.cmd inside the program directory.
rem Runs the CLI on the Node runtime bundled at node\ when this package carries one,
rem otherwise on system Node (>= 24). The web assets sit beside it at web\.
rem
rem There is deliberately no penguin.ps1 sibling: PowerShell prefers .ps1 over .cmd on
rem PATH, and client Windows defaults to the Restricted execution policy, which would
rem then break the plain `penguin` command. Batch files are exempt from that policy.
setlocal
set "DIR=%~dp0.."
rem The front-end build this install serves: Adelie's own spelling wins, then the
rem pre-rename PENGUIN_WEB_DIST an older launcher or an operator's environment set (the
rem reader accepts both and prefers this one).
if not defined ADELIE_WEB_DIST if defined PENGUIN_WEB_DIST set "ADELIE_WEB_DIST=%PENGUIN_WEB_DIST%"
if not defined ADELIE_WEB_DIST set "ADELIE_WEB_DIST=%DIR%\web"
rem The data root this install owns: the installer keeps it inside the program directory as
rem data\, which is where an install made before the rename keeps its Agents and Sessions.
rem An explicit ADELIE_HOME wins, then the pre-2.2 PENGUIN_HOME, then this install's own data\.
if not defined ADELIE_HOME if defined PENGUIN_HOME set "ADELIE_HOME=%PENGUIN_HOME%"
if not defined ADELIE_HOME set "ADELIE_HOME=%DIR%\data"
if exist "%DIR%\git\usr\bin\sh.exe" set "ADELIE_BUNDLED_SHELL=%DIR%\git\usr\bin\sh.exe"
if exist "%DIR%\node\node.exe" (
  "%DIR%\node\node.exe" "%DIR%\lib\dist\penguin.js" %*
) else (
  node "%DIR%\lib\dist\penguin.js" %*
)
exit /b %ERRORLEVEL%

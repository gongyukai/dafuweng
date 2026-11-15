@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Monopoly Online
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\online.ps1"
pause
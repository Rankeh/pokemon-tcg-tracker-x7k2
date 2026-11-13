@echo off
rem Uso:  ejecutar_windows.bat [previa|final|alta] [escritorio|movil]
rem Si Blender no esta en la ruta habitual:  set BLENDER_EXE="D:\Ruta\blender.exe"
setlocal
set MODO=%1
if "%MODO%"=="" set MODO=previa
set VISTA=%2
if "%VISTA%"=="" set VISTA=escritorio
if "%BLENDER_EXE%"=="" set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
if not exist %BLENDER_EXE% (
  echo No encuentro Blender en %BLENDER_EXE%
  echo Define la variable BLENDER_EXE con la ruta de blender.exe y vuelve a ejecutar.
  exit /b 1
)
cd /d "%~dp0"
%BLENDER_EXE% --background --python crear_escena.py -- --modo %MODO% --vista %VISTA% --guardar-blend > salida\registro_%VISTA%_%MODO%.txt 2>&1
type salida\registro_%VISTA%_%MODO%.txt | findstr /i "teselia AVISO Error Traceback"
echo.
echo Resultado en blender\salida\  (PNG, .blend y registro completo)

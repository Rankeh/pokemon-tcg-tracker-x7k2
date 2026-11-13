@echo off
rem Depuracion de la carta ilustrada (3 renders independientes + verificaciones).
rem Uso:  ejecutar_depuracion_windows.bat [todos|1|2|3]
rem Si Blender no esta en la ruta habitual:  set BLENDER_EXE="D:\Ruta\blender.exe"
setlocal
set PASO=%1
if "%PASO%"=="" set PASO=todos
if "%BLENDER_EXE%"=="" set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
if not exist %BLENDER_EXE% (
  echo No encuentro Blender en %BLENDER_EXE%
  exit /b 1
)
cd /d "%~dp0"
if not exist salida mkdir salida
%BLENDER_EXE% --background --python crear_depuracion_carta.py -- --paso %PASO% > salida\registro_depuracion.txt 2>&1
type salida\registro_depuracion.txt | findstr /i "verif teselia AVISO Error Traceback"
echo.
echo Resultado en blender\salida\  (depuracion_1..3 .png, depuracion_paso*.json y registro_depuracion.txt)

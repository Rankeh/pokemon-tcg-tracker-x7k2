@echo off
rem Prueba de materiales (3 bolsillos).  Uso:  ejecutar_materiales_windows.bat [previa|final|alta]
rem Si Blender no esta en la ruta habitual:  set BLENDER_EXE="D:\Ruta\blender.exe"
setlocal
set MODO=%1
if "%MODO%"=="" set MODO=previa
if "%BLENDER_EXE%"=="" set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
if not exist %BLENDER_EXE% (
  echo No encuentro Blender en %BLENDER_EXE%
  echo Define la variable BLENDER_EXE con la ruta de blender.exe y vuelve a ejecutar.
  exit /b 1
)
cd /d "%~dp0"
if not exist salida mkdir salida
%BLENDER_EXE% --background --python crear_prueba_materiales.py -- --modo %MODO% --guardar-blend > salida\registro_materiales_%MODO%.txt 2>&1
type salida\registro_materiales_%MODO%.txt | findstr /i "teselia AVISO Error Traceback"
echo.
echo Resultado en blender\salida\  (materiales_prueba_%MODO%.png, .blend y registro completo)

@echo off
rem Fase 3.5: exporta el album a GLB desde Blender.  Uso:  ejecutar_glb_windows.bat
rem Si Blender no esta en la ruta habitual:  set BLENDER_EXE="D:\Ruta\blender.exe"
setlocal
if "%BLENDER_EXE%"=="" set BLENDER_EXE="C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"
if not exist %BLENDER_EXE% (
  echo No encuentro Blender en %BLENDER_EXE%
  echo Define la variable BLENDER_EXE con la ruta de blender.exe y vuelve a ejecutar.
  exit /b 1
)
cd /d "%~dp0"
if not exist salida mkdir salida
%BLENDER_EXE% --background --python exportar_glb_blender.py -- --salida ..\web\prueba-3d\modelo\album_blender.glb > salida\registro_glb.txt 2>&1
type salida\registro_glb.txt | findstr /i "GLB Objetos Aviso Error Traceback"
echo.
echo GLB en web\prueba-3d\modelo\album_blender.glb  (abrelo con ?modelo=album_blender.glb)

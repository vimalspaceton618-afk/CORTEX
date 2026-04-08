@echo off
REM ================================================
REM CORTEX 100k TRAINING - RESUME TOMORROW
REM This script continues from where we left off
REM ================================================

cd /d E:\verai\cortex

echo.
echo ================================================
echo CORTEX 100k TRAINING - FINALIZATION
echo ================================================
echo.
echo This will:
echo 1. Rebuild FAISS index from 100,711 sharded entries
echo 2. Create proper ID mapping
echo 3. Verify knowledge graph
echo.
echo Expected time: 20-30 minutes (CPU) or 5-10 min (GPU)
echo ================================================
echo.

pause

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH
    pause
    exit /b 1
)

REM Run finalization
echo.
echo Starting finalization...
echo.

python scripts/finalize_100k.py

if errorlevel 1 (
    echo.
    echo ERROR: Finalization failed
    pause
    exit /b 1
)

echo.
echo ================================================
echo FINALIZATION COMPLETE
echo ================================================
echo.
echo Next steps:
echo 1. Test query: python cortex/cli.py ask "What are SFT?"
echo 2. Check status: python cortex/cli.py status
echo 3. View stats: type TRAINING_STATUS.md
echo.
pause

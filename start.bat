@echo off
REM HealthHub Quick Start Script for Windows

echo ============================================================
echo HealthHub - Quick Start
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo [1/4] Checking Python installation...
python --version
echo.

REM Navigate to backend directory
cd backend

REM Check if virtual environment exists
if not exist "venv" (
    echo [2/4] Creating virtual environment...
    python -m venv venv
    echo Virtual environment created.
    echo.
) else (
    echo [2/4] Virtual environment already exists.
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo [3/4] Installing dependencies...
pip install -q -r requirements.txt
echo Dependencies installed.
echo.

REM Initialize database
echo [4/4] Initializing database...
python init_db.py
echo.

REM Start the server
echo ============================================================
echo Starting HealthHub Backend Server...
echo ============================================================
echo.
echo Backend will run on: http://localhost:5000
echo.
echo To access the application:
echo 1. Open a new terminal
echo 2. Navigate to the frontend directory
echo 3. Run: python -m http.server 8000
echo 4. Open browser: http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo ============================================================
echo.

python app.py

pause


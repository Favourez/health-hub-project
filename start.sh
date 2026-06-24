#!/bin/bash
# HealthHub Quick Start Script for macOS/Linux

echo "============================================================"
echo "HealthHub - Quick Start"
echo "============================================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/"
    exit 1
fi

echo "[1/4] Checking Python installation..."
python3 --version
echo ""

# Navigate to backend directory
cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "[2/4] Creating virtual environment..."
    python3 -m venv venv
    echo "Virtual environment created."
    echo ""
else
    echo "[2/4] Virtual environment already exists."
    echo ""
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "[3/4] Installing dependencies..."
pip install -q -r requirements.txt
echo "Dependencies installed."
echo ""

# Initialize database
echo "[4/4] Initializing database..."
python init_db.py
echo ""

# Start the server
echo "============================================================"
echo "Starting HealthHub Backend Server..."
echo "============================================================"
echo ""
echo "Backend will run on: http://localhost:5000"
echo ""
echo "To access the application:"
echo "1. Open a new terminal"
echo "2. Navigate to the frontend directory"
echo "3. Run: python3 -m http.server 8000"
echo "4. Open browser: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "============================================================"
echo ""

python app.py


@echo off
echo ============================================================
echo Starting HealthHub Backend Server
echo ============================================================
echo.
cd backend
python app.py

@echo off
echo ============================================================
echo Starting HealthHub Frontend Server
echo ============================================================
echo.
echo Frontend will be available at: http://localhost:8000
echo.
cd frontend
python -m http.server 8000
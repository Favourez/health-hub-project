# Start Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python app.py"

# Wait a moment
Start-Sleep -Seconds 2

# Start Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; python -m http.server 8000"

Write-Host "Servers starting..."
Write-Host "Backend: http://localhost:5000"
Write-Host "Frontend: http://localhost:8000"


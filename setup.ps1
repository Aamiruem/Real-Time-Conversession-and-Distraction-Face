# One-time setup: Python venv + every Python requirement, backend .env, and the React (Vite) frontend.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating .venv (Python 3.11)..." -ForegroundColor Cyan
    py -3.11 -m venv .venv
}
Write-Host "Installing Python requirements (backend + Streamlit)..." -ForegroundColor Cyan
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not (Test-Path "backend\.env")) { Copy-Item "backend\.env.example" "backend\.env" }
if (-not (Test-Path "frontend\.env.local")) { Copy-Item "frontend\.env.example" "frontend\.env.local" }

Write-Host "Training the fatigue model (if missing)..." -ForegroundColor Cyan
if (-not (Test-Path "backend\ml\artifacts\fatigue_model.joblib")) {
    Push-Location backend; ..\.venv\Scripts\python.exe -m ml.train; Pop-Location
}

Write-Host "Installing frontend packages + MediaPipe assets..." -ForegroundColor Cyan
Push-Location frontend; npm install; Pop-Location

Write-Host "Done. Start everything with: .\start.ps1" -ForegroundColor Green

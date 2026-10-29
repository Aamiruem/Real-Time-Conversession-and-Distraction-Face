# Starts the API, the React (Vite) app and the Streamlit UI, each in its own window.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File .\start.ps1  [-NoStreamlit]
param([switch]$NoStreamlit)
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

# MongoDB first, so the backend's mirror connects on startup (no-op when it's already running)
& "$PSScriptRoot\run-mongo.ps1"

# run-backend.ps1 replaces an old backend still holding port 8010, so the latest code always loads
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$PSScriptRoot\run-backend.ps1`""
Start-Process powershell -WorkingDirectory "$PSScriptRoot\frontend" -ArgumentList "-NoExit", "-Command", "npm run dev"
if (-not $NoStreamlit) {
    Start-Process powershell -WorkingDirectory "$PSScriptRoot\frontend\streamlit" -ArgumentList "-NoExit", "-Command",
        "& '$py' -m streamlit run app.py --server.port 8501"
}

Write-Host "API        http://localhost:8010/docs"
Write-Host "React app  https://localhost:3000  (meeting links work for others on your Wi-Fi)"
if (-not $NoStreamlit) { Write-Host "Streamlit  http://localhost:8501" }

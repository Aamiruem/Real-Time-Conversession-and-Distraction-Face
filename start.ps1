# Starts the API, the React (Vite) app and the Streamlit UI, each in its own window.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File .\start.ps1  [-NoStreamlit]
param([switch]$NoStreamlit)
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

Start-Process powershell -WorkingDirectory "$PSScriptRoot\backend" -ArgumentList "-NoExit", "-Command",
    "& '$py' -m uvicorn app.main:app --reload --port 8010"
# Empty leftovers from the old Next.js layout (all React code is in frontend\src now)
foreach ($d in "frontend\app", "frontend\components") {
    if ((Test-Path $d) -and -not (Get-ChildItem $d -Force)) { Remove-Item $d }
}
Start-Process powershell -WorkingDirectory "$PSScriptRoot\frontend" -ArgumentList "-NoExit", "-Command", "npm run dev"
if (-not $NoStreamlit) {
    Start-Process powershell -WorkingDirectory "$PSScriptRoot\frontend\streamlit" -ArgumentList "-NoExit", "-Command",
        "& '$py' -m streamlit run app.py --server.port 8501"
}

Write-Host "API        http://localhost:8010/docs"
Write-Host "React app  http://localhost:3000"
if (-not $NoStreamlit) { Write-Host "Streamlit  http://localhost:8501" }

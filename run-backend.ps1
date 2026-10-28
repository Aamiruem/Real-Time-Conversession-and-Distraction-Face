# Starts the Presence AI backend (FastAPI) from any folder:
#   powershell -ExecutionPolicy Bypass -File "<project folder>\run-backend.ps1"   [-Port 8010]
# If an older Presence backend is still running on the port, it is stopped first, so the latest code always loads.
# Any other program on the port is left alone (pick another port with -Port).
param([int]$Port = 8010)

$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Python environment not found - run setup.ps1 in the project folder first." -ForegroundColor Red
    exit 1
}

function Stop-Tree([int]$id) {
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" | ForEach-Object { Stop-Tree $_.ProcessId }
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

function Test-OurBackend {
    # Only this project's backend (any version, old name included) is ever stopped - other uvicorn apps are left alone.
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 5
        return $health.app -in @("Presence AI", "FocusLink AI")
    } catch { return $false }
}

function Get-OldBackend([int]$ownerId) {
    # The processes to stop for the backend that owns the port, or $null if the port belongs to another program.
    if (-not (Test-OurBackend)) { return $null }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
    if ($owner) {
        # with --reload the port belongs to a worker whose parent (the reloader) would start a new one: stop both
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($owner.ParentProcessId)"
        if ($parent -and $parent.CommandLine -match "uvicorn.*app\.main") { return @($parent.ProcessId, $ownerId) }
        return @($ownerId)
    }
    # The owner already exited, but a child it spawned (multiprocessing) inherited the socket and keeps answering.
    $orphans = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ownerId" |
        Where-Object { $_.CommandLine -match "multiprocessing|uvicorn|app\.main" } | ForEach-Object { $_.ProcessId })
    if ($orphans.Count) { return $orphans }
    return $null
}

for ($try = 0; $try -lt 3; $try++) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { break }
    $ids = Get-OldBackend $listener.OwningProcess
    if (-not $ids) {
        Write-Host "Port $Port is used by another program (PID $($listener.OwningProcess)). Start on another port: -Port 8011" -ForegroundColor Red
        exit 1
    }
    Write-Host "Stopping the old backend on port $Port (PID $($ids -join ', '))..." -ForegroundColor Yellow
    foreach ($id in $ids) { Stop-Tree $id }
    Start-Sleep -Seconds 1
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port $Port is still busy. Close the window running the old backend, then run this again." -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $root "backend")
Write-Host "Presence AI backend -> http://localhost:$Port/docs  (Ctrl+C to stop)" -ForegroundColor Cyan
& $python -m uvicorn app.main:app --port $Port

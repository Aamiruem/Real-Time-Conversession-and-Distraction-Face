# Makes sure MongoDB is running on localhost:27017 for the backend's mirror (MONGODB_URI in backend/.env).
# Uses the MongoDB Windows service when it's already running; otherwise starts mongod.exe as a normal user process
# (no admin needed) with its data in <drive>:\PresenceAI\mongo-data on the first drive with 2 GB free (C: first),
# or in -DataDir / $env:MONGO_DATA. Safe to run twice.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File .\run-mongo.ps1  [-DataDir D:\mongo]
param([string]$DataDir = $env:MONGO_DATA)
$port = 27017
function Test-Mongo {
    $c = New-Object Net.Sockets.TcpClient
    try { $c.ConnectAsync("127.0.0.1", $port).Wait(300) -and $c.Connected } catch { $false } finally { $c.Dispose() }
}

if (Test-Mongo) { Write-Host "MongoDB already running on localhost:$port"; exit 0 }

$mongod = (Get-Command mongod.exe -ErrorAction SilentlyContinue).Source
if (-not $mongod) {
    $mongod = Get-ChildItem "$env:ProgramFiles\MongoDB\Server\*\bin\mongod.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $mongod) {
    Write-Host "MongoDB is not installed. Install MongoDB Community Server, or put a MongoDB Atlas URI in MONGODB_URI."
    exit 1
}

$data = $DataDir
if (-not $data) {
    # MongoDB refuses to start on a full disk ("No space left on device"), so skip drives that are nearly full
    $drive = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -gt 2GB } | Sort-Object { $_.Name -ne "C" }, Name |
        Select-Object -First 1
    if (-not $drive) { Write-Host "No drive has 2 GB free for MongoDB's data - free up some disk space."; exit 1 }
    $data = "$($drive.Name):\PresenceAI\mongo-data"
}
New-Item -ItemType Directory -Force $data | Out-Null
$log = Join-Path $data "mongod.log"
Start-Process $mongod -WindowStyle Hidden -ArgumentList "--dbpath", "`"$data`"", "--port", $port, "--bind_ip", "127.0.0.1",
    "--logpath", "`"$log`"", "--logappend"

foreach ($i in 1..30) {
    Start-Sleep -Milliseconds 500
    if (Test-Mongo) { Write-Host "MongoDB started on localhost:$port (data: $data)"; exit 0 }
}
Write-Host "MongoDB did not start - see $log"
exit 1

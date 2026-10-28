# Creates the online database for Presence AI: Amazon RDS PostgreSQL (encrypted, 7-day backups), reachable from
# this computer's public IP only, and fills in DB_* in backend/.env.
#
# Needs the AWS CLI v2 (https://aws.amazon.com/cli/) set up with `aws configure` (an IAM user allowed to use RDS
# and EC2 security groups). db.t3.micro + 20 GB is free-tier eligible for the first 12 months; billed after that.
#
#   powershell -ExecutionPolicy Bypass -File deploy\aws\setup_rds.ps1 [-Region ap-south-1] [-DbId presence-db]
#
# Then move your data online:   cd backend; python -m app.db_cli copy --to aws
# and switch the app to it:     set DATABASE=aws in backend/.env and restart the backend
param(
    [string]$Region = "ap-south-1",
    [string]$DbId = "presence-db",
    [string]$DbName = "focuslink",
    [string]$DbUser = "focuslink"
)
$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "..\..\backend\.env"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "AWS CLI not found. Install it from https://aws.amazon.com/cli/ and run 'aws configure' first." -ForegroundColor Red
    exit 1
}
aws sts get-caller-identity --output text | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "AWS CLI is not signed in - run 'aws configure'." -ForegroundColor Red; exit 1 }

# A strong random password without characters RDS rejects (/ @ " and space)
$chars = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!"
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$password = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

$myIp = (Invoke-RestMethod "https://checkip.amazonaws.com").Trim()
Write-Host ">> Your public IP is $myIp - only it will be allowed to connect" -ForegroundColor Cyan

$vpc = aws ec2 describe-vpcs --region $Region --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text
$sg = aws ec2 describe-security-groups --region $Region --filters Name=group-name,Values=$DbId-sg Name=vpc-id,Values=$vpc `
    --query "SecurityGroups[0].GroupId" --output text
if ($sg -eq "None") {
    Write-Host ">> Creating security group $DbId-sg"
    $sg = aws ec2 create-security-group --region $Region --group-name "$DbId-sg" --vpc-id $vpc `
        --description "Presence AI database access" --query GroupId --output text
}
aws ec2 authorize-security-group-ingress --region $Region --group-id $sg --protocol tcp --port 5432 --cidr "$myIp/32" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "   (port 5432 is already open for $myIp)" }

Write-Host ">> Creating RDS PostgreSQL instance $DbId (takes about 5-10 minutes)" -ForegroundColor Cyan
aws rds create-db-instance --region $Region --db-instance-identifier $DbId --engine postgres `
    --db-instance-class db.t3.micro --allocated-storage 20 --storage-type gp3 --storage-encrypted `
    --db-name $DbName --master-username $DbUser --master-user-password $password `
    --vpc-security-group-ids $sg --publicly-accessible --backup-retention-period 7 --no-multi-az `
    --auto-minor-version-upgrade --deletion-protection | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Could not create the database (see the error above)." -ForegroundColor Red; exit 1 }

aws rds wait db-instance-available --region $Region --db-instance-identifier $DbId
$endpoint = aws rds describe-db-instances --region $Region --db-instance-identifier $DbId `
    --query "DBInstances[0].Endpoint.Address" --output text

# Fill in DB_* in backend/.env (DATABASE stays as it is until you copy your data and switch)
$lines = if (Test-Path $envFile) { Get-Content $envFile } else { @() }
$values = [ordered]@{ DB_HOST = $endpoint; DB_PORT = "5432"; DB_NAME = $DbName; DB_USER = $DbUser; DB_PASSWORD = $password }
foreach ($key in $values.Keys) {
    $line = "$key=$($values[$key])"
    if ($lines -match "^$key=") { $lines = $lines -replace "^$key=.*", $line } else { $lines += $line }
}
[System.IO.File]::WriteAllLines((Resolve-Path -LiteralPath (Split-Path $envFile)).Path + "\.env", [string[]]$lines,
    (New-Object System.Text.UTF8Encoding $false))  # no BOM, so the first setting reads correctly

Write-Host ""
Write-Host "Done. The database is ready at $endpoint and backend/.env has its DB_* settings." -ForegroundColor Green
Write-Host "Next:"
Write-Host "  cd backend; python -m app.db_cli status --db aws     # check the connection"
Write-Host "  cd backend; python -m app.db_cli copy --to aws       # move your data online"
Write-Host "  then set DATABASE=aws in backend/.env and restart the backend"
Write-Host "If your IP changes, allow the new one: aws ec2 authorize-security-group-ingress --group-id $sg --protocol tcp --port 5432 --cidr <new-ip>/32"

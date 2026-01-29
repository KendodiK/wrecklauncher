# Generates a locally-trusted HTTPS cert for localhost using mkcert.
# Output:
#   certs/localhost-cert.pem
#   certs/localhost-key.pem

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$certDir = Join-Path $repoRoot 'certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$mkcertCmd = Get-Command mkcert -ErrorAction SilentlyContinue
$mkcertExe = $null
if ($mkcertCmd -and $mkcertCmd.Source) {
  $mkcertExe = $mkcertCmd.Source
} else {
  # winget installs may not be on PATH until a new shell is opened
  $candidate = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter mkcert.exe -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) { $mkcertExe = $candidate.FullName }
}

if (-not $mkcertExe) {
  Write-Error "mkcert not found. Install it first: 'winget install FiloSottile.mkcert' or 'choco install mkcert'."
}

Write-Host "Using mkcert at: $mkcertExe"

# Ensure local CA is installed (safe to run multiple times)
& $mkcertExe -install | Out-Host

Push-Location $certDir
try {
  # mkcert outputs files in the current directory when using -cert-file/-key-file
  & $mkcertExe -cert-file localhost-cert.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1 | Out-Host

  $certPath = Join-Path $certDir 'localhost-cert.pem'
  $keyPath  = Join-Path $certDir 'localhost-key.pem'

  if (-not (Test-Path $certPath) -or -not (Test-Path $keyPath)) {
    throw "mkcert did not produce expected files in $certDir"
  }

  Write-Host "Created: $certPath"
  Write-Host "Created: $keyPath"
  Write-Host "Server.js will auto-detect these on startup."
}
finally {
  Pop-Location
}

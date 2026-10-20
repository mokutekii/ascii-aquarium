$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (!$node) { throw 'Node.js was not found on PATH. Install it from https://nodejs.org and try again.' }
Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $PSScriptRoot 'start.cjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden

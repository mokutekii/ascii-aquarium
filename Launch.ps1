$ErrorActionPreference = 'Stop'
Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $PSScriptRoot 'Launch.vbs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden

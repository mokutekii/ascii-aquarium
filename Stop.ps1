$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($node) { & $node (Join-Path $PSScriptRoot 'stop.cjs') }

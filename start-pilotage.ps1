$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
node --use-system-ca server.js

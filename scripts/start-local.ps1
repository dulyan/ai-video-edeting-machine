$ErrorActionPreference = 'Stop'
try {
  & (Get-Command node.exe).Source (Join-Path $PSScriptRoot 'local.mjs') start
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the local app. See the logs in Local AppData\AI Video Edeting Machine\logs.' }
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($_.Exception.Message, 'AI Video Edeting Machine') | Out-Null
}

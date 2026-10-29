$ErrorActionPreference = 'Stop'
try {
  & (Get-Command node.exe).Source (Join-Path $PSScriptRoot 'local.mjs') stop
  if ($LASTEXITCODE -ne 0) { throw 'The backend could not be stopped safely. See the local app logs.' }
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($_.Exception.Message, 'AI Video Edeting Machine') | Out-Null
}

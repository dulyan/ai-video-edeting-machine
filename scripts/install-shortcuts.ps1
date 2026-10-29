param([Parameter(Mandatory=$true)][string]$RepoRoot)
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
foreach ($action in @('Start','Stop')) {
  $shortcut = $shell.CreateShortcut((Join-Path $desktop "$action AI Video Edeting Machine.lnk"))
  $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $scriptPath = Join-Path $RepoRoot ("scripts\" + $action.ToLower() + '-local.ps1')
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '"'
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.Description = "$action the local AI Video Edeting Machine browser app"
  $shortcut.Save()
}

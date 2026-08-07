# Uninstall tool for Desktop Task Manager
# Usage:
#   powershell -ExecutionPolicy Bypass -File "uninstall.ps1"            # full uninstall (removes app data)
#   powershell -ExecutionPolicy Bypass -File "uninstall.ps1" -KeepData  # uninstall but keep your tasks/data
param(
  [switch]$KeepData
)

$exe = "$PSScriptRoot\DesktopTaskManager-v1.0.0-setup.exe"

# 1) Prefer the official NSIS uninstaller if an installed copy exists
$uninstallers = @(
  "$env:ProgramFiles\Desktop Task Manager\Uninstall Desktop Task Manager.exe",
  "$env:LOCALAPPDATA\Programs\Desktop Task Manager\Uninstall Desktop Task Manager.exe"
)
foreach ($u in $uninstallers) {
  if (Test-Path $u) {
    Write-Host "Running official uninstaller: $u"
    Start-Process $u -Wait
    Write-Host "Done. Official uninstaller finished."
    if (-not $KeepData) {
      Remove-Item "$env:APPDATA\com.desktop.taskmanager" -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "App data removed."
    }
    exit 0
  }
}

Write-Host "No installed copy found, cleaning up portable/registry leftovers..."

# 2) Stop running processes
Stop-Process -Name app -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

# 3) Remove autostart registry entries (HKCU Run)
$runPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Test-Path $runPath) {
  $run = Get-Item $runPath
  foreach ($v in $run.Property) {
    $val = (Get-ItemProperty -Path $runPath -Name $v).$v
    if ($val -like "*Desktop Task Manager*" -or $v -eq "com.desktop.taskmanager") {
      Remove-ItemProperty -Path $runPath -Name $v -ErrorAction SilentlyContinue
      Write-Host "Removed autostart entry: $v"
    }
  }
}

# 4) Remove install directories
Remove-Item "$env:ProgramFiles\Desktop Task Manager" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Programs\Desktop Task Manager" -Recurse -Force -ErrorAction SilentlyContinue

# 5) Remove start menu + desktop shortcuts
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Desktop Task Manager.lnk" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Desktop Task Manager.lnk" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\Desktop\Desktop Task Manager.lnk" -Force -ErrorAction SilentlyContinue

# 6) Remove app data (unless -KeepData)
if (-not $KeepData) {
  Remove-Item "$env:APPDATA\com.desktop.taskmanager" -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "App data removed."
} else {
  Write-Host "App data kept (tasks/database preserved)."
}

# 7) Optionally delete the installer itself
if (Test-Path $exe) {
  Remove-Item $exe -Force -ErrorAction SilentlyContinue
}

Write-Host "Uninstall complete."

# Run the worker using the project venv. Creates venv and installs deps if needed.
# Prefers Python 3.12 or 3.11 (required for numpy/moviepy wheels on Windows; 3.14 has no pre-built wheels).
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Creating virtual environment and installing dependencies..."
    $created = $false
    try { py -3.12 -m venv .venv 2>$null; if (Test-Path $venvPython) { $created = $true } } catch {}
    if (-not $created) { try { if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }; py -3.11 -m venv .venv 2>$null; if (Test-Path $venvPython) { $created = $true } } catch {} }
    if (-not $created) { try { if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }; python -m venv .venv 2>$null; if (Test-Path $venvPython) { $created = $true } } catch {} }
    if (-not $created) {
        Write-Error "Could not create venv. Install Python 3.12 from https://www.python.org/downloads/ (numpy/moviepy need 3.11 or 3.12 on Windows), then run this script again."
        exit 1
    }
    & $venvPython -m pip install --upgrade pip -q
    & $venvPython -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "If you see numpy/compiler errors above: install Python 3.12 from https://www.python.org/downloads/, delete the .venv folder, then run this script again."
        Write-Error "Failed to install requirements"; exit 1
    }
    Write-Host "Done. Starting worker."
}

& $venvPython -m src.cli worker

# Quick start (Windows PowerShell)
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
  python -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env — edit ES/vLLM/embed URLs before use."
}
uvicorn app.main:app --reload --host 0.0.0.0 --port 8088

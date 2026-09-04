$ErrorActionPreference = 'Stop'

# Pokinex -> Poknex-Lab offline synchronizer.
# Uses the user's local Git credentials; no token is stored in this repository.

$sourceRepo = 'https://github.com/KaelxDev/Pokinex.git'
$targetRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workRoot = Join-Path $env:TEMP 'pokinex-lab-sync'
$sourceDir = Join-Path $workRoot 'Pokinex'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git não foi encontrado no PATH.'
}

if (Test-Path $workRoot) {
    Remove-Item $workRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $workRoot | Out-Null

Write-Host 'Clonando Pokinex...' -ForegroundColor Cyan
git clone --depth 1 $sourceRepo $sourceDir

function Sync-Directory {
    param(
        [Parameter(Mandatory)] [string]$From,
        [Parameter(Mandatory)] [string]$To
    )

    New-Item -ItemType Directory -Path $To -Force | Out-Null

    robocopy $From $To /E /NFL /NDL /NJH /NJS /NP `
        /XD '__pycache__' 'node_modules' 'dist' '.git' `
        /XF '.env' '*.pyc' | Out-Null

    if ($LASTEXITCODE -ge 8) {
        throw "Falha ao copiar $From para $To (robocopy=$LASTEXITCODE)."
    }
}

Write-Host 'Sincronizando backend/app...' -ForegroundColor Cyan
Sync-Directory (Join-Path $sourceDir 'backend/app') (Join-Path $targetRoot 'backend/app')

foreach ($file in @('requirements.txt', 'requirements-dev.txt', 'pyproject.toml', '.env.example')) {
    $sourceFile = Join-Path $sourceDir "backend/$file"
    if (Test-Path $sourceFile) {
        Copy-Item $sourceFile (Join-Path $targetRoot "backend/$file") -Force
    }
}

Write-Host 'Sincronizando frontend/src...' -ForegroundColor Cyan
Sync-Directory (Join-Path $sourceDir 'frontend/src') (Join-Path $targetRoot 'frontend/src')

Write-Host 'Sincronizando frontend/public...' -ForegroundColor Cyan
Sync-Directory (Join-Path $sourceDir 'frontend/public') (Join-Path $targetRoot 'frontend/public')

foreach ($file in @('index.html', 'package.json', 'package-lock.json', 'vite.config.js', '.env.example')) {
    $sourceFile = Join-Path $sourceDir "frontend/$file"
    if (Test-Path $sourceFile) {
        Copy-Item $sourceFile (Join-Path $targetRoot "frontend/$file") -Force
    }
}

$extraImage = Join-Path $sourceDir 'frontend/ChatGPT Image 4_09_2026, 03_31_25.png'
if (Test-Path $extraImage) {
    Copy-Item $extraImage (Join-Path $targetRoot 'frontend/ChatGPT Image 4_09_2026, 03_31_25.png') -Force
}

# Remove generated local artifacts from the lab after syncing.
Get-ChildItem $targetRoot -Recurse -Directory -Force |
    Where-Object { $_.Name -in @('__pycache__', 'node_modules', 'dist') } |
    Sort-Object FullName -Descending |
    ForEach-Object {
        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }

Remove-Item $workRoot -Recurse -Force

Write-Host ''
Write-Host 'Sincronização concluída.' -ForegroundColor Green
Write-Host 'Revise as alterações com: git status'
Write-Host 'Depois execute: git add backend frontend && git commit -m "chore: sync Pokinex updates to lab"'

# Installe le harnais dans le projet du jeu. À lancer depuis la racine du projet :
#   powershell -ExecutionPolicy Bypass -File .\tools\installer.ps1
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Step($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }

Step '1/6 Prerequis'
if (-not (Has git)) { winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements; Refresh-Path }
foreach ($c in 'node','npm','git','claude') { if (Has $c) { Write-Host "OK $c" -ForegroundColor Green } else { Write-Host "MANQUE $c : installe-le, ferme et rouvre PowerShell, puis relance ce script." -ForegroundColor Red; exit 1 } }

Step '2/6 Projet Vite present ?'
$pkg = if (Test-Path package.json) { Get-Content package.json -Raw | ConvertFrom-Json } else { $null }
if (-not $pkg -or -not $pkg.scripts.build) {
  Write-Host "Pas de projet Vite ici (package.json sans script build). Cree-le d'abord (LISEZMOI, etape 0), puis relance." -ForegroundColor Red; exit 1
}

Step '3/6 Identite git (sinon les commits automatiques echouent)'
if (-not (git config --global user.name)) { $n = Read-Host 'Ton prenom'; git config --global user.name "$n" }
if (-not (git config --global user.email)) { $m = Read-Host 'Ton email'; git config --global user.email "$m" }

Step '4/6 Outils de test (Playwright = navigateur pilote par code)'
npm i -D playwright
npx playwright install chromium
npm pkg set "scripts.verifier=npm run build && node tools/capture.mjs"
npm pkg set "scripts.captures=node tools/capture.mjs --parcours --demo"
npm pkg set "scripts.video=node tools/capture.mjs --parcours --demo --video"
npm pkg set "scripts.planche=node tools/planche.mjs"

Step '5/6 Skills externes (pack complet threejs-game-skills : rendu AAA, interface, game feel, QA)'
npx -y skills add majidmanzarpour/threejs-game-skills --skill '*' -a claude-code --copy -y
if ($LASTEXITCODE -ne 0) { Write-Host "Echec (sans gravite) : on peut s'en passer, les skills du harnais couvrent l'essentiel." -ForegroundColor Yellow }

Step '6/6 .gitignore et premier commit'
$ig = @('node_modules','dist','captures','.env','.env.local','.claude/settings.local.json','.claude/worktrees')
$cur = if (Test-Path .gitignore) { Get-Content .gitignore } else { @() }
$ig | Where-Object { $cur -notcontains $_ } | Add-Content .gitignore
if (-not (Test-Path .git)) { git init -q }
git add -A; git commit -qm "Harnais installe"
Write-Host "`nTermine. Lance 'claude' dans ce dossier, accepte la confiance du dossier, puis lis LISEZMOI.md." -ForegroundColor Cyan

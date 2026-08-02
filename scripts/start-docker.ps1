param(
  [switch]$NoBuild,
  [switch]$Cache,
  [switch]$Logs
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$dataDir = Join-Path $projectRoot 'data'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not installed or is not on PATH.'
}

if (-not (Test-Path $envFile)) {
  throw "Missing .env file at $envFile. Copy .env.example to .env first."
}

if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
}

Write-Host "Starting Kimble's Sales Bot from $projectRoot" -ForegroundColor Cyan
Write-Host "Using env file: $envFile" -ForegroundColor DarkGray

Push-Location $projectRoot
try {
  Write-Host 'Stopping old containers...' -ForegroundColor Yellow
  & docker compose down --remove-orphans

  if (-not $NoBuild) {
    if ($Cache) {
      Write-Host 'Building image with cache...' -ForegroundColor Yellow
      & docker compose build
    } else {
      Write-Host 'Building image without cache...' -ForegroundColor Yellow
      & docker compose build --no-cache
    }
  } else {
    Write-Host 'Skipping image build.' -ForegroundColor Yellow
  }

  Write-Host 'Starting fresh container...' -ForegroundColor Yellow
  & docker compose up -d --force-recreate

  Write-Host 'Verifying running container...' -ForegroundColor Yellow
  & docker compose ps
  & docker compose exec -T cycling-marketplace-bot sh -lc "echo \"PWD=$PWD\"; echo \"DATA_FILE=${DATA_FILE:-unset}\"; ls -la /app/data || true"
  & docker compose exec -T cycling-marketplace-bot sh -lc "node -e \"const fs=require('fs'); const p=process.env.DATA_FILE||'/app/data/marketplace-state.json'; console.log('stateFile='+p); if (!fs.existsSync(p)) { console.log('stateExists=false'); process.exit(0); } const raw=fs.readFileSync(p,'utf8'); const state=JSON.parse(raw); console.log('stateExists=true'); console.log('destinations=' + Object.keys(state.destinations||{}).length); console.log('watchedForums=' + Object.keys(state.watchedForums||{}).length); console.log('mirroredThreads=' + Object.keys(state.mirroredThreads||{}).length); console.log('stravaGuilds=' + Object.keys(state.stravaGuilds||{}).length); console.log('stravaConnections=' + Object.keys(state.stravaConnections||{}).length);\""
  & docker compose exec -T cycling-marketplace-bot sh -lc "node -e \"const fs=require('fs'); const p=(process.env.DATA_FILE||'/app/data/marketplace-state.json') + '.bak'; console.log('backupStateFile='+p); if (!fs.existsSync(p)) { console.log('backupStateExists=false'); process.exit(0); } const raw=fs.readFileSync(p,'utf8'); const state=JSON.parse(raw); console.log('backupStateExists=true'); console.log('backupDestinations=' + Object.keys(state.destinations||{}).length); console.log('backupWatchedForums=' + Object.keys(state.watchedForums||{}).length); console.log('backupMirroredThreads=' + Object.keys(state.mirroredThreads||{}).length); console.log('backupStravaGuilds=' + Object.keys(state.stravaGuilds||{}).length); console.log('backupStravaConnections=' + Object.keys(state.stravaConnections||{}).length);\""
  & docker compose exec -T cycling-marketplace-bot sh -lc "grep -n 'Weather by Open-Meteo | card layout\\|Forecast Card\\|Daily Card' /app/src/weatherService.js"
  & docker compose exec -T cycling-marketplace-bot sh -lc "grep -n 'Official Feed Rankings\\|recent-feed snapshot\\|official recent club feed' /app/src/stravaService.js"

  if ($Logs) {
    & docker compose logs -f
  }
} finally {
  Pop-Location
}

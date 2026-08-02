#!/usr/bin/env sh
set -eu

NO_BUILD=0
SHOW_LOGS=0
USE_CACHE=0

for arg in "$@"; do
  case "$arg" in
    --no-build)
      NO_BUILD=1
      ;;
    --cache)
      USE_CACHE=1
      ;;
    --logs)
      SHOW_LOGS=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: ./scripts/start-docker.sh [--no-build] [--cache] [--logs]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
DATA_DIR="$PROJECT_ROOT/data"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not on PATH." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env file at $ENV_FILE. Copy .env.example to .env first." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

echo "Starting Kimble's Sales Bot from $PROJECT_ROOT"
echo "Using env file: $ENV_FILE"

cd "$PROJECT_ROOT"

echo "Stopping old containers..."
docker compose down --remove-orphans

if [ "$NO_BUILD" -eq 1 ]; then
  echo "Skipping image build."
else
  if [ "$USE_CACHE" -eq 1 ]; then
    echo "Building image with cache..."
    docker compose build
  else
    echo "Building image without cache..."
    docker compose build --no-cache
  fi
fi

echo "Starting fresh container..."
docker compose up -d --force-recreate

echo "Verifying running container..."
docker compose ps
docker compose exec -T cycling-marketplace-bot sh -lc "echo \"PWD=$PWD\"; echo \"DATA_FILE=${DATA_FILE:-unset}\"; ls -la /app/data || true"
docker compose exec -T cycling-marketplace-bot sh -lc "node -e \"const fs=require('fs'); const p=process.env.DATA_FILE||'/app/data/marketplace-state.json'; console.log('stateFile='+p); if (!fs.existsSync(p)) { console.log('stateExists=false'); process.exit(0); } const raw=fs.readFileSync(p,'utf8'); const state=JSON.parse(raw); console.log('stateExists=true'); console.log('destinations=' + Object.keys(state.destinations||{}).length); console.log('watchedForums=' + Object.keys(state.watchedForums||{}).length); console.log('mirroredThreads=' + Object.keys(state.mirroredThreads||{}).length); console.log('stravaGuilds=' + Object.keys(state.stravaGuilds||{}).length); console.log('stravaConnections=' + Object.keys(state.stravaConnections||{}).length);\""
docker compose exec -T cycling-marketplace-bot sh -lc "node -e \"const fs=require('fs'); const p=(process.env.DATA_FILE||'/app/data/marketplace-state.json') + '.bak'; console.log('backupStateFile='+p); if (!fs.existsSync(p)) { console.log('backupStateExists=false'); process.exit(0); } const raw=fs.readFileSync(p,'utf8'); const state=JSON.parse(raw); console.log('backupStateExists=true'); console.log('backupDestinations=' + Object.keys(state.destinations||{}).length); console.log('backupWatchedForums=' + Object.keys(state.watchedForums||{}).length); console.log('backupMirroredThreads=' + Object.keys(state.mirroredThreads||{}).length); console.log('backupStravaGuilds=' + Object.keys(state.stravaGuilds||{}).length); console.log('backupStravaConnections=' + Object.keys(state.stravaConnections||{}).length);\""
docker compose exec -T cycling-marketplace-bot sh -lc "grep -n 'Weather by Open-Meteo | card layout\\|Forecast Card\\|Daily Card' /app/src/weatherService.js"
docker compose exec -T cycling-marketplace-bot sh -lc "grep -n 'Official Feed Rankings\\|recent-feed snapshot\\|official recent club feed' /app/src/stravaService.js"

if [ "$SHOW_LOGS" -eq 1 ]; then
  docker compose logs -f
fi

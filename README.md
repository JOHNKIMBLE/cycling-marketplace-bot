# Kimble's Chicago Cycling Sales Bot
n[![CI](https://github.com/johnkimble/cycling-marketplace-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/johnkimble/cycling-marketplace-bot/actions/workflows/ci.yml)

One Discord bot for cycling servers with three features:

- shared marketplace syncing across forum channels
- per-server Strava club tools
- ride-focused weather and meetup location tools

The bot is meant to run once and be invited into multiple Discord servers. Each server keeps its own config in the shared JSON state file.

## Features

### Marketplace

- Mirrors forum posts from watched source forums into destination forums across connected servers
- Carries over listing details, source metadata, price detection, images, and external sale links when available
- Adds clear contact buttons for mirrored listings:
  - `Message Seller`
  - `Join Source Server`
  - `View Original Listing`
- Supports backfill for recent posts
- Supports seller-centric reply relays:
  - comments in mirrored threads can relay back to the original thread
  - seller replies in the source thread can relay back out to mirrors
- Includes network diagnostics and permission checks

### Strava

- Per-server Strava OAuth connection
- Per-server club config
- `/strava club`, `/strava leaderboard`, `/strava recent`
- Scheduled digests for leaderboard and recent activity
- Weekly leaderboard digests can post as a club recap with rider spotlights

### Weather and Location

- `/location beginning` saves a server’s starting meetup point
- `/location end` saves an optional end point
- `/location get` shows beginning, end, or both
- `/weather forecast` uses the saved beginning location by default
- `/weather automate` posts weather automatically to a chosen channel on chosen days/times
- Weather automation can post every time or only when rain/wind makes the ride window look rough

## Requirements

- Node.js 20+ if running outside Docker
- Discord bot application
- Strava application
- public callback URL for Strava OAuth

## Discord App Setup

Required OAuth scopes:

- `bot`
- `applications.commands`

Recommended bot permissions:

- `View Channels`
- `Read Message History`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Create Public Threads`
- `Send Messages in Threads`

Optional but recommended:

- `Create Instant Invite`
  - lets the bot generate source-server invite links automatically for marketplace mirrors

In the Discord Developer Portal:

- enable `MESSAGE CONTENT INTENT`

## Environment

Copy `.env.example` to `.env`.

Example:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
LOG_LEVEL=info
NETWORK_GUILD_ALLOWLIST=
DATA_FILE=/app/data/marketplace-state.json

STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_REDIRECT_URI=https://strava.example.com/strava/callback
STRAVA_OAUTH_PORT=3049
STRAVA_OAUTH_HOST=0.0.0.0
STRAVA_OAUTH_SCOPES=read,activity:read
STRAVA_DEFAULT_CLUB_ID=
```

Most important vars:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATA_FILE`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `STRAVA_OAUTH_SCOPES`

## Strava Scope Requirement

Use:

```env
STRAVA_OAUTH_SCOPES=read,activity:read
```

If the Strava callback page shows:

- `Requested scopes: read`

then the running container still has old env values. Reconnect alone will not fix it.

Correct reconnect flow:

1. Redeploy the container with the updated env.
2. Run `/strava disconnect`.
3. Run `/strava connect`.
4. Confirm the callback page shows `Requested scopes: read, activity:read`.

## Docker

Included files:

- `Dockerfile`
- `compose.yaml`
- `.dockerignore`
- `scripts/start-docker.ps1`
- `scripts/start-docker.sh`
- `scripts/release-images.ps1`

Default port:

- `3049`

Endpoints:

- `/strava/callback`
- `/health`

### Run with Docker Compose

```bash
docker compose up -d --build
```

### Startup Scripts

Windows:

```powershell
.\scripts\start-docker.ps1
.\scripts\start-docker.ps1 -NoBuild
.\scripts\start-docker.ps1 -Cache
.\scripts\start-docker.ps1 -Logs
```

Linux / Unraid:

```bash
chmod +x ./scripts/start-docker.sh
./scripts/start-docker.sh
./scripts/start-docker.sh --no-build
./scripts/start-docker.sh --cache
./scripts/start-docker.sh --logs
```

## Unraid Notes

Recommended settings:

- container port `3049`
- host port `3049`
- restart policy `unless-stopped`
- persistent data mounted to the same path used by `DATA_FILE`

For the included compose file:

- host path: `./data`
- container path: `/app/data`

Recommended env:

- `DATA_FILE=/app/data/marketplace-state.json`
- `STRAVA_OAUTH_HOST=0.0.0.0`
- `STRAVA_OAUTH_PORT=3049`

## Reverse Proxy

Use a public hostname like:

- `strava.example.com`

Set:

- `STRAVA_REDIRECT_URI=https://strava.example.com/strava/callback`

Proxy that hostname to:

- `http://<server-ip>:3049`

## Quick Start

### Marketplace

If a server should receive synced listings:

- `/marketplace setup forum:<destination-forum>`

If a server should publish listings to the network:

- `/marketplace watch forum:<source-forum>`

If a server should do both:

- run both commands

Useful marketplace commands:

- `/marketplace setup`
- `/marketplace disconnect`
- `/marketplace watch`
- `/marketplace unwatch`
- `/marketplace list`
- `/marketplace network`
- `/marketplace backfill`
- `/marketplace diagnose`
- `/marketplace diagnose_network`

### Strava

Basic server flow:

1. `/strava setup club_id:<club-id>`
2. `/strava connect`
3. finish OAuth
4. `/strava status`

Useful Strava commands:

- `/strava setup`
- `/strava connect`
- `/strava disconnect`
- `/strava status`
- `/strava clear`
- `/strava club`
- `/strava leaderboard`
- `/strava recent`
- `/strava run_digest`

### Location and Weather

Examples:

- `/location beginning location:Walgreens on Bryn Mawr and Clark, Chicago`
- `/location beginning location:Walgreens on Bryn Mawr and Clark, Chicago maps_url:https://www.google.com/maps/...`
- `/location end location:Montrose Harbor, Chicago`
- `/location get`
- `/location get target:beginning`
- `/location get target:end`
- `/location get target:both`
- `/weather forecast`
- `/weather forecast period:weekend`
- `/weather forecast view:hourly`
- `/weather automate channel:#rides days:saturday,sunday time_local:07:30`
- `/weather automate channel:#rides days:saturday,sunday time_local:07:30 alert_mode:bad_only`
- `/weather automate_clear`

If a beginning location is saved, `/weather forecast` will use it by default when no `location:` override is provided.

## Behavior Notes

### Marketplace

Mirrored listing content can include:

- source thread link
- source server and forum
- seller name
- seller contact mention when possible
- source-server invite link
- inferred category
- detected price and OBO markers
- images and attachments when available
- native external link unfurls when Discord supports them
- contact buttons for seller/server/original listing

### Strava

Each Discord server keeps its own:

- connected athlete token
- club ID
- digest channels
- digest timing
- weekly recap styling in scheduled leaderboard digests

Important caveats:

- one bot can still use one Strava app
- Strava rate limits are shared across all connected servers
- the connected athlete must have access to the configured club
- exact website parity is not guaranteed from the official API

### Location

- location lookup accepts both loose descriptions and exact addresses
- beginning and end are stored separately
- you can optionally save a manual Google Maps share URL or iframe `src` for nicer previews
- `/location get` can show beginning only, end only, or both
- Google Maps links are posted separately for quick opening and potential Discord preview

### Weather

Weather cards include:

- summary card
- hourly or 3-hour forecast cards for single-day views
- daily cards for weekend and 10-day views
- weather icon image
- wind, gusts, precipitation, humidity, sunrise, and sunset where applicable
- ride-window summary text so automated alerts can skip good conditions when configured

## Logging

Logs are structured for Dozzle.

Recommended levels:

- `LOG_LEVEL=info` for normal use
- `LOG_LEVEL=debug` for troubleshooting

Debug logging includes:

- startup config
- Strava OAuth scopes
- Strava request and aggregation details
- marketplace diagnostics

## Health Check

`GET /health` returns:

```json
{"ok":true}
```

## Troubleshooting

### Marketplace diagnose says permissions are missing

The Developer Portal install screen is not the whole story. Check channel and category overrides on the actual forum channel too.

### Strava callback only shows `read`

The running container still has old env values. Redeploy first, then reconnect Strava.

### `/strava recent` or `/strava leaderboard` looks incomplete

Possible causes:

- runtime still only has `read`
- the connected athlete cannot see all club data
- Strava’s official feed is shallow for that club

### Weather still shows old output

If you still see the old wall-of-text weather layout, the running container is stale and has not picked up the new renderer.

## Project Structure

- `src/index.js`
- `src/commands.js`
- `src/store.js`
- `src/marketplaceService.js`
- `src/listingParser.js`
- `src/stravaService.js`
- `src/stravaScheduler.js`
- `src/stravaOAuthServer.js`
- `src/weatherService.js`
- `src/weatherScheduler.js`
- `src/logger.js`
- `scripts/*`
- `tests/*`

## Admin Guide

For a click-by-click Discord server owner guide, see:

- [DISCORD_ADMIN_SETUP.md](DISCORD_ADMIN_SETUP.md)

# AGENTS.md

This file is for onboarding another AI agent into this repository quickly and accurately.

It describes:

- what the bot does
- how the runtime is wired together
- where the important logic lives
- current known caveats
- how to test and deploy changes safely

## Project Summary

This repository is a Discord bot for Chicago cycling communities.

It currently has three product areas:

1. Marketplace sync across Discord forum channels
2. Per-server Strava club tools and digests
3. Ride-focused weather forecasts

The bot is meant to be hosted once and invited into many Discord servers. Each server keeps its own configuration in a shared JSON state file.

## Tech Stack

- Node.js
- ESM modules
- `discord.js`
- `dotenv`
- built-in `fetch`
- JSON file persistence, no database

There is no framework like Express. The only HTTP server is the small Strava OAuth callback server in `src/stravaOAuthServer.js`.

## Top-Level Runtime

Entrypoint: `src/index.js`

At startup the app:

1. Loads env via `src/config.js`
2. Creates a Discord client with:
   - `Guilds`
   - `GuildMessages`
   - `MessageContent`
3. Creates shared services:
   - `MarketplaceStore`
   - `MarketplaceService`
   - `StravaService`
   - `StravaScheduler`
   - `WeatherService`
   - `StravaOAuthServer`
4. Loads persisted state from disk
5. Logs in to Discord
6. Registers slash commands in every guild
7. Starts the Strava scheduler
8. Starts the Strava callback server

Important event handlers in `src/index.js`:

- `InteractionCreate`
  - routes slash commands into `handleCommandInteraction`
- `ThreadCreate`
  - mirrors watched marketplace forum posts into destination forums
- `ThreadUpdate`
  - syncs mirrored copies when the source thread changes
- `MessageUpdate`
  - syncs mirror starter content when the source starter post changes
- `MessageCreate`
  - powers the 2-way marketplace bridge
- `ThreadDelete`
  - closes mirrored threads when the source is deleted

## Configuration

Main config file: `src/config.js`

Required env:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`

Important optional env:

- `DATA_FILE`
- `LOG_LEVEL`
- `NETWORK_GUILD_ALLOWLIST`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`
- `STRAVA_OAUTH_PORT`
- `STRAVA_OAUTH_HOST`
- `STRAVA_OAUTH_SCOPES`
- `STRAVA_DEFAULT_CLUB_ID`

Important Strava note:

- The runtime expects `STRAVA_OAUTH_SCOPES=read,activity:read`
- If the running container only has `read`, Strava recent activity detail will be degraded
- The callback page explicitly shows both granted scopes and requested scopes

## Persistence Model

Persistence is in `src/store.js`.

Storage is a single JSON file with this shape:

- `destinations`
  - destination marketplace forums by guild
- `watchedForums`
  - source marketplace forums by forum channel id
- `mirroredThreads`
  - source thread -> mirrored thread records and relay tracking
- `stravaGuilds`
  - per-guild Strava config
- `stravaConnections`
  - per-guild Strava OAuth connection state
- `stravaAuthStates`
  - temporary OAuth state during connect flow

Notes:

- There is no database locking beyond the write chain in `MarketplaceStore`
- `#persist()` serializes writes by chaining promises
- Store includes backward-compat normalization for older mirror records

## Marketplace Architecture

Core file: `src/marketplaceService.js`

Related file: `src/listingParser.js`

Marketplace model:

- A watched forum is a source of listings
- A destination forum receives mirrored copies
- One server may be both a source and a destination

Mirror flow:

1. Source forum thread is created
2. Bot fetches starter message and forum tags
3. Bot analyzes the listing
4. Bot creates a mirrored forum thread in every eligible destination
5. Bot persists the source -> mirror mapping

Mirror payload includes:

- original listing URL
- team/source metadata
- seller name
- listing price if detected
- status
- summary embed

Sync flow:

- Source thread title/status changes -> mirrored thread metadata updates
- Source starter message edits -> mirrored starter message updates
- Source deleted -> mirrors are renamed, archived, and locked

2-way bridge:

- Mirror comment -> relayed back to source thread
- Seller reply in source thread -> relayed to all mirrors

Bridge tracking:

- `sourceToMirrorRelays`
- `mirrorToSourceRelays`

These prevent duplicate relay loops.

## Strava Architecture

Main files:

- `src/stravaService.js`
- `src/stravaOAuthServer.js`
- `src/stravaScheduler.js`
- command wiring in `src/commands.js`

### Strava Config Model

Per Discord guild the bot stores:

- default club id
- leaderboard digest channel + interval
- recent activity digest channel + interval
- connected athlete token set

OAuth is per guild, not global per bot.

### Strava OAuth Flow

1. Admin runs `/strava connect`
2. Bot creates a temporary auth state record
3. Bot returns a Strava authorize URL
4. User approves on Strava
5. Strava redirects to `/strava/callback`
6. `StravaOAuthServer` exchanges the code for tokens
7. Tokens and granted scopes are stored under that guild

Important implementation detail:

- `approval_prompt=force` is set so reconnects show a fresh consent screen

### Strava API Use

Current service methods include:

- `getClub`
- `getClubActivities`
- `getActivity`
- `hydrateActivities`
- `getClubActivitiesForWeek`
- `getClubLeaderboard`
- embed builders for club, leaderboard, and recent activity

The service has in-memory caching keyed by guild and endpoint.

### Strava Scheduler

`src/stravaScheduler.js` polls once per minute by default.

For each guild config with a club id:

- send leaderboard digest if due
- send recent activity digest if due

The last sent timestamps are persisted back into the store.

### Current Strava Caveats

This is the most fragile area of the project.

Important truths:

1. The official Strava club activity feed is not a perfect mirror of the website’s recent activity page
2. Club feed objects can be shallow or oddly shaped
3. Some data appears nested under `activity` or similar shapes
4. Activity ids, start dates, and media are not guaranteed in every club feed response
5. Website leaderboard totals do not always match a naive aggregation over club activity API results

Recent fixes already in code:

- club activity items are normalized through `normalizeClubActivity`
- athlete grouping now prefers nested ride activity data over misleading top-level blocks
- bogus fallback ride links are avoided if there is no activity id
- leaderboard entries now track `longest_distance`
- misleading “use all fetched activities if timestamps are missing” fallback was removed

Still unresolved / likely next work:

- exact leaderboard parity with Strava’s website
- exact recent activity parity with website cards
- reliable map image extraction for all recent rides
- better payload introspection from live Strava responses

If Strava work is being debugged, assume the live payload shape matters more than local assumptions.

## Weather Architecture

Core file: `src/weatherService.js`

Weather sources:

- Open-Meteo geocoding API
- Open-Meteo forecast API

Command supports:

- `today`
- `tomorrow`
- weekdays
- `weekend`
- `ten_day`
- `hourly`
- `three_hour`

Weather rendering model:

- one summary embed
- one card per hourly slot or day

Markers that identify the new renderer:

- footer `Weather by Open-Meteo | card layout`
- titles like `9 AM | Forecast Card`
- titles like `Sat, Apr 11 | Daily Card`

If Discord still shows one giant wall-of-text weather card, the running container is stale.

## Command Surface

Defined in `src/commands.js`

### Marketplace

- `/marketplace setup`
- `/marketplace disconnect`
- `/marketplace watch`
- `/marketplace unwatch`
- `/marketplace list`
- `/marketplace network`
- `/marketplace backfill`

### Strava

- `/strava setup`
- `/strava connect`
- `/strava disconnect`
- `/strava status`
- `/strava clear`
- `/strava club`
- `/strava leaderboard`
- `/strava recent`
- `/strava run_digest`

### Weather

- `/weather`

Notes:

- admin-style Strava subcommands are ephemeral
- marketplace setup commands require `ManageGuild`
- command registration happens on startup and guild join

## Logging

File: `src/logger.js`

Logs are JSON strings with:

- timestamp
- level
- message
- context
- normalized error block when present

Levels:

- `debug`
- `info`
- `warn`
- `error`

This is meant to be easy to read in Dozzle.

Useful for debugging:

- startup scope logs
- Strava request failures
- scheduler failures
- command failures

## Docker / Deployment

Important files:

- `Dockerfile`
- `compose.yaml`
- `scripts/start-docker.sh`
- `scripts/start-docker.ps1`
- `scripts/release-images.ps1`

Current container assumptions:

- app port `3049`
- health endpoint `/health`

Current compose mount:

- `./data:/mnt/cache/docker/connors-cycling-discord-bot`

Important caveat:

- `DATA_FILE` must point to the same effective path the running container should use
- `.env.example` defaults to `./data/marketplace-state.json`
- README examples may discuss `/app/data` or `/mnt/cache/...`
- if state path and mount target drift, persistence can become confusing

Startup scripts were made more aggressive to avoid stale containers:

- `docker compose down --remove-orphans`
- build without cache by default
- `docker compose up -d --force-recreate`
- grep inside the running container to confirm the weather card renderer exists

## Testing

Primary test command:

```bash
npm test
```

Useful syntax checks:

```bash
node --check src/index.js
node --check src/stravaService.js
```

Current tests cover:

- listing parsing
- store persistence behaviors
- relay tracking
- Strava leaderboard aggregation
- weather helper logic

There are not yet full integration tests for Discord or Strava live calls.

## Working Conventions For Another Agent

When making changes here:

1. Preserve ESM style
2. Avoid adding heavy dependencies unless absolutely necessary
3. Keep persistence backward-compatible where possible
4. Be careful with Discord forum/thread assumptions
5. Treat Strava website parity as a data-source problem first, not just an embed-format problem
6. Prefer verifying whether a problem is stale Docker code before changing bot logic

If debugging user-reported issues:

- compare screenshots against current source markers
- confirm the running container actually contains the current code
- confirm Strava callback page shows requested scopes correctly
- only then trust runtime behavior

## Fast Mental Map Of The Repo

- `src/index.js`
  - startup and Discord event wiring
- `src/commands.js`
  - slash command definitions and handlers
- `src/store.js`
  - JSON persistence
- `src/marketplaceService.js`
  - forum mirroring and 2-way bridge
- `src/listingParser.js`
  - listing analysis
- `src/stravaService.js`
  - Strava API, OAuth session generation, embeds, caching
- `src/stravaOAuthServer.js`
  - callback server and health endpoint
- `src/stravaScheduler.js`
  - digest polling
- `src/weatherService.js`
  - geocoding, forecast fetch, weather embed cards
- `src/logger.js`
  - structured logs
- `tests/*`
  - unit tests
- `scripts/*`
  - Docker startup and image release helpers

## Highest-Risk Areas

If an agent only has time to be cautious in a few places, make it these:

1. Strava data mapping and leaderboard correctness
2. Docker/runtime staleness versus source-code reality
3. Marketplace relay loop prevention
4. Data file path consistency across env, compose, and docs

## Recommended Next Improvements

Strong candidates for future work:

- add Strava debug/admin commands that dump normalized payload summaries
- make leaderboard source match Strava’s website more closely
- improve recent activity media extraction and ride identity
- add per-server default weather locations
- add more integration-style verification around marketplace relay behavior

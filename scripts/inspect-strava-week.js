import fs from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function parseArgs(argv) {
  const args = {
    guildId: null,
    clubId: null,
    token: process.env.STRAVA_DEBUG_ACCESS_TOKEN || process.env.STRAVA_ACCESS_TOKEN || null,
    pages: 6,
    perPage: 50,
    outDir: 'data',
    hydrate: false,
    detailLimit: 15,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === '--guild' || arg === '--guild-id') && next) {
      args.guildId = next;
      index += 1;
      continue;
    }

    if (arg === '--club' && next) {
      args.clubId = next;
      index += 1;
      continue;
    }

    if (arg === '--token' && next) {
      args.token = next;
      index += 1;
      continue;
    }

    if (arg === '--pages' && next) {
      args.pages = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--per-page' && next) {
      args.perPage = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--out-dir' && next) {
      args.outDir = next;
      index += 1;
      continue;
    }

    if (arg === '--hydrate') {
      args.hydrate = true;
      continue;
    }

    if (arg === '--detail-limit' && next) {
      args.detailLimit = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/inspect-strava-week.js [--guild <guildId>] [--club <clubId>] [--token <token>] [--pages 6] [--per-page 50] [--hydrate] [--detail-limit 15]

Defaults:
  - Reads .env automatically
  - Reads DATA_FILE from .env, defaulting to ./data/marketplace-state.json
  - If --guild is provided, pulls the club id and stored Strava token from bot state
  - If only one guild has a Strava connection, it will auto-select it

Examples:
  node scripts/inspect-strava-week.js --guild 1130525257195847831
  node scripts/inspect-strava-week.js --guild 1130525257195847831 --hydrate
  node scripts/inspect-strava-week.js --club 1196678 --token YOUR_TOKEN --pages 8 --per-page 50
`);
}

async function readStateFile() {
  const dataFile = path.resolve(process.cwd(), process.env.DATA_FILE?.trim() || './data/marketplace-state.json');
  const raw = await fs.readFile(dataFile, 'utf8');
  return {
    dataFile,
    state: JSON.parse(raw),
  };
}

function resolveGuildSelection(state, requestedGuildId) {
  const connectionIds = Object.keys(state?.stravaConnections ?? {});

  if (requestedGuildId) {
    return requestedGuildId;
  }

  if (connectionIds.length === 1) {
    return connectionIds[0];
  }

  return null;
}

function resolveRuntimeContext(args, state) {
  const guildId = resolveGuildSelection(state, args.guildId);
  const guildConfig = guildId ? state?.stravaGuilds?.[guildId] ?? null : null;
  const connection = guildId ? state?.stravaConnections?.[guildId] ?? null : null;

  const clubId = String(
    args.clubId
      || guildConfig?.defaultClubId
      || process.env.STRAVA_DEFAULT_CLUB_ID
      || '',
  ).trim() || null;

  const token = args.token || connection?.accessToken || null;

  return {
    guildId,
    guildConfig,
    connection,
    clubId,
    token,
  };
}

async function fetchJson(relativePath, token) {
  const response = await fetch(`${STRAVA_API_BASE}${relativePath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'KimbleBot-Strava-Week-Debug/1.0',
    },
  });

  const body = await response.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    relativePath,
    contentType: response.headers.get('content-type') || null,
    json,
    rawBodyPreview: body.slice(0, 1200),
  };
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      return value;
    }
  }

  return null;
}

function formatStartDate(activity) {
  return pickFirst(
    activity?.start_date_local,
    activity?.start_date,
    activity?.start_time_local,
    activity?.start_time,
    activity?.startDateLocal,
    activity?.startDate,
    activity?.startTimeLocal,
    activity?.startTime,
    activity?.start_date_raw,
    activity?.occurred_at,
    activity?.occurredAt,
    activity?.created_at,
    activity?.createdAt,
    activity?.timestamp,
    activity?.time,
    activity?.time_local,
    activity?.timeLocal,
    activity?.date,
    activity?.activity?.start_date_local,
    activity?.activity?.start_date,
    activity?.activity?.start_time_local,
    activity?.activity?.start_time,
    activity?.activity?.occurred_at,
    activity?.activity?.occurredAt,
    activity?.activity?.created_at,
    activity?.activity?.createdAt,
    activity?.activity?.timestamp,
    activity?.activity?.time,
    activity?.activity?.time_local,
    activity?.entity?.activity?.start_date_local,
    activity?.entity?.activity?.start_date,
    activity?.entity?.activity?.start_time_local,
    activity?.entity?.activity?.start_time,
    activity?.entity?.activity?.occurred_at,
    activity?.entity?.activity?.occurredAt,
    activity?.entity?.activity?.created_at,
    activity?.entity?.activity?.createdAt,
    activity?.entity?.activity?.timestamp,
    activity?.entity?.activity?.time,
    activity?.entity?.activity?.time_local,
  ) || null;
}

function normalizeClubActivity(activity) {
  const nestedActivity = activity?.activity || activity?.entity?.activity || activity?.entry?.activity || activity?.item?.activity || null;
  const nestedAthlete = activity?.entity?.athlete || activity?.member?.athlete || nestedActivity?.athlete || null;
  const athlete = {
    ...(activity?.athlete || {}),
    ...(nestedActivity?.athlete || {}),
    ...(nestedAthlete || {}),
  };

  return {
    ...activity,
    ...(nestedActivity || {}),
    id: pickFirst(
      activity?.id,
      activity?.activity_id,
      activity?.activityId,
      activity?.resource_id,
      nestedActivity?.id,
      nestedActivity?.activity_id,
      nestedActivity?.activityId,
      nestedActivity?.resource_id,
    ),
    name: pickFirst(activity?.name, nestedActivity?.name, activity?.title, nestedActivity?.title),
    distance: pickFirst(activity?.distance, nestedActivity?.distance),
    total_elevation_gain: pickFirst(
      activity?.total_elevation_gain,
      nestedActivity?.total_elevation_gain,
      activity?.elevation_gain,
      nestedActivity?.elevation_gain,
    ),
    moving_time: pickFirst(activity?.moving_time, nestedActivity?.moving_time, activity?.elapsed_time, nestedActivity?.elapsed_time),
    average_speed: pickFirst(activity?.average_speed, nestedActivity?.average_speed),
    start_date: pickFirst(activity?.start_date, nestedActivity?.start_date, activity?.occurred_at, nestedActivity?.occurred_at),
    start_date_local: pickFirst(activity?.start_date_local, nestedActivity?.start_date_local),
    athlete,
    athlete_id: pickFirst(activity?.athlete_id, nestedActivity?.athlete_id, athlete?.id),
  };
}

function getAthleteDisplayName(activity) {
  return pickFirst(
    activity?.athlete?.fullname,
    activity?.athlete?.name,
    [activity?.athlete?.firstname, activity?.athlete?.lastname].filter(Boolean).join(' ').trim(),
    activity?.athlete_name,
  ) || 'Unknown rider';
}

function normalizeNameToken(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || null;
}

function getNameParts(name) {
  const normalized = normalizeNameToken(name);
  if (!normalized) {
    return { normalized: null, first: null, last: null, lastInitial: null };
  }

  const parts = normalized.split(' ').filter(Boolean);
  const first = parts[0] || null;
  const last = parts.length > 1 ? parts[parts.length - 1] : null;
  return {
    normalized,
    first,
    last,
    lastInitial: last ? last.charAt(0) : null,
  };
}

function buildActivityAthleteAliases(activity) {
  const aliases = new Set();
  const athleteId = activity?.athlete?.id || activity?.athlete_id || null;
  if (athleteId) {
    aliases.add(`id:${athleteId}`);
  }

  const candidateNames = [
    activity?.athlete?.fullname,
    activity?.athlete?.name,
    [activity?.athlete?.firstname, activity?.athlete?.lastname].filter(Boolean).join(' ').trim(),
    activity?.athlete_name,
    getAthleteDisplayName(activity),
  ].filter(Boolean);

  for (const name of candidateNames) {
    const parts = getNameParts(name);
    if (!parts.normalized) {
      continue;
    }

    aliases.add(`name:${parts.normalized}`);
    if (parts.first && parts.lastInitial) {
      aliases.add(`namefi:${parts.first} ${parts.lastInitial}`);
    }
  }

  return [...aliases];
}

function aggregateLeaderboardEntries(activities) {
  const leaderboard = new Map();
  const aliasToPrimaryKey = new Map();

  for (const rawActivity of activities) {
    const activity = normalizeClubActivity(rawActivity);
    if (!(Number(activity.distance) > 0)) {
      continue;
    }

    const aliases = buildActivityAthleteAliases(activity);
    const existingAlias = aliases.find((alias) => aliasToPrimaryKey.has(alias));
    const athleteKey = existingAlias ? aliasToPrimaryKey.get(existingAlias) : (aliases[0] || `activity:${activity.id || Math.random().toString(36).slice(2)}`);
    const athleteName = getAthleteDisplayName(activity);
    const existing = leaderboard.get(athleteKey) || {
      athlete_id: activity?.athlete?.id || activity?.athlete_id || null,
      athlete_name: athleteName,
      distance: 0,
      elevation_gain: 0,
      moving_time: 0,
      activity_count: 0,
      longest_distance: 0,
    };

    existing.athlete_id = existing.athlete_id || activity?.athlete?.id || activity?.athlete_id || null;
    if (existing.athlete_name === 'Unknown rider' && athleteName !== 'Unknown rider') {
      existing.athlete_name = athleteName;
    }
    existing.distance += Number(activity.distance) || 0;
    existing.elevation_gain += Number(activity.total_elevation_gain) || 0;
    existing.moving_time += Number(activity.moving_time) || 0;
    existing.activity_count += 1;
    existing.longest_distance = Math.max(existing.longest_distance, Number(activity.distance) || 0);
    leaderboard.set(athleteKey, existing);

    for (const alias of aliases) {
      aliasToPrimaryKey.set(alias, athleteKey);
    }
  }

  return [...leaderboard.values()].sort((left, right) => {
    if (right.distance !== left.distance) {
      return right.distance - left.distance;
    }

    if (right.activity_count !== left.activity_count) {
      return right.activity_count - left.activity_count;
    }

    return (right.elevation_gain || 0) - (left.elevation_gain || 0);
  });
}

function getWeekRange(weekOffset = 0, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - (weekOffset * 7));

  const start = new Date(end);
  const day = start.getDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(start);
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  return { start, end: rangeEnd };
}

function belongsToWeek(activity, start, end) {
  const value = formatStartDate(activity);
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) && parsed >= start.getTime() && parsed < end.getTime();
}

function summarizeActivityPresence(activities) {
  const summary = {
    total: activities.length,
    withAnyId: 0,
    withAnyStartDate: 0,
    withAthleteId: 0,
  };

  for (const rawActivity of activities) {
    const activity = normalizeClubActivity(rawActivity);
    if (activity.id) {
      summary.withAnyId += 1;
    }
    if (formatStartDate(activity)) {
      summary.withAnyStartDate += 1;
    }
    if (activity.athlete?.id || activity.athlete_id) {
      summary.withAthleteId += 1;
    }
  }

  return summary;
}

function buildTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

async function hydrateActivities(activities, token, detailLimit) {
  const hydrated = [];

  for (const rawActivity of activities.slice(0, detailLimit)) {
    const activity = normalizeClubActivity(rawActivity);
    if (!activity.id) {
      hydrated.push({
        summary: activity,
        skipped: true,
        reason: 'No activity id in club feed row',
      });
      continue;
    }

    const detail = await fetchJson(`/activities/${activity.id}`, token);
    hydrated.push({
      summary: activity,
      detail,
    });
  }

  return hydrated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const { dataFile, state } = await readStateFile();
  const context = resolveRuntimeContext(args, state);

  if (!context.clubId) {
    console.error('Could not resolve a Strava club id. Pass --club or configure /strava setup for a guild.');
    process.exitCode = 1;
    return;
  }

  if (!context.token) {
    console.error('Could not resolve a Strava access token. Pass --token or use a guild that has a stored Strava connection.');
    process.exitCode = 1;
    return;
  }

  const pages = Number.isFinite(args.pages) && args.pages > 0 ? Math.min(args.pages, 20) : 6;
  const perPage = Number.isFinite(args.perPage) && args.perPage > 0 ? Math.min(args.perPage, 200) : 50;
  const allActivities = [];
  const pageSummaries = [];

  for (let page = 1; page <= pages; page += 1) {
    const response = await fetchJson(`/clubs/${context.clubId}/activities?page=${page}&per_page=${perPage}`, context.token);
    const rows = Array.isArray(response.json) ? response.json : [];
    pageSummaries.push({
      page,
      status: response.status,
      rowCount: rows.length,
      sampleTimestamps: rows.slice(0, 5).map((row) => formatStartDate(normalizeClubActivity(row))),
    });

    if (!response.ok) {
      break;
    }

    allActivities.push(...rows);
    if (rows.length < perPage) {
      break;
    }
  }

  const normalizedActivities = allActivities.map(normalizeClubActivity);
  const weekRange = getWeekRange(0);
  const thisWeekActivities = normalizedActivities.filter((activity) => belongsToWeek(activity, weekRange.start, weekRange.end));
  const weeklyEntries = aggregateLeaderboardEntries(thisWeekActivities);
  const feedSnapshotEntries = aggregateLeaderboardEntries(normalizedActivities);
  const hydrated = args.hydrate ? await hydrateActivities(normalizedActivities, context.token, args.detailLimit) : [];

  const output = {
    generatedAt: new Date().toISOString(),
    stateFile: dataFile,
    guildId: context.guildId,
    guildName: context.guildConfig?.guildName ?? null,
    clubId: context.clubId,
    clubName: context.guildConfig?.guildName ?? null,
    tokenSource: args.token ? 'cli-or-env' : (context.connection ? 'stored-guild-connection' : 'unknown'),
    scopes: context.connection?.scopes ?? null,
    weekWindow: {
      start: weekRange.start.toISOString(),
      end: weekRange.end.toISOString(),
    },
    pageSummaries,
    presenceSummary: summarizeActivityPresence(normalizedActivities),
    thisWeek: {
      activityCount: thisWeekActivities.length,
      topEntries: weeklyEntries.slice(0, 15),
      sampleActivities: thisWeekActivities.slice(0, 10).map((activity) => ({
        athlete: getAthleteDisplayName(activity),
        name: activity.name || null,
        id: activity.id || null,
        start: formatStartDate(activity),
        distance: activity.distance ?? null,
        elevation: activity.total_elevation_gain ?? null,
      })),
    },
    feedSnapshot: {
      activityCount: normalizedActivities.length,
      topEntries: feedSnapshotEntries.slice(0, 15),
      firstTenActivities: normalizedActivities.slice(0, 10).map((activity) => ({
        athlete: getAthleteDisplayName(activity),
        name: activity.name || null,
        id: activity.id || null,
        start: formatStartDate(activity),
        distance: activity.distance ?? null,
        elevation: activity.total_elevation_gain ?? null,
      })),
    },
    hydratedDetails: hydrated,
  };

  const outDir = path.resolve(process.cwd(), args.outDir);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `strava-week-debug-${context.clubId}-${buildTimestamp()}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Saved Strava week debug output to ${outPath}`);
  console.log('');
  console.log('Context:');
  console.log(`- state file: ${dataFile}`);
  console.log(`- guild: ${context.guildConfig?.guildName ?? context.guildId ?? 'not resolved'}`);
  console.log(`- club: ${context.clubId}`);
  console.log(`- token source: ${output.tokenSource}`);
  console.log(`- scopes: ${(context.connection?.scopes ?? []).join(', ') || 'unknown'}`);
  console.log('');
  console.log('Feed summary:');
  console.log(`- total fetched rows: ${normalizedActivities.length}`);
  console.log(`- rows with activity id: ${output.presenceSummary.withAnyId}`);
  console.log(`- rows with timestamp-like field: ${output.presenceSummary.withAnyStartDate}`);
  console.log(`- rows with athlete id: ${output.presenceSummary.withAthleteId}`);
  console.log('');
  console.log('Weekly window:');
  console.log(`- start: ${weekRange.start.toISOString()}`);
  console.log(`- end:   ${weekRange.end.toISOString()}`);
  console.log(`- rows in window: ${thisWeekActivities.length}`);
  console.log('');
  console.log('Top weekly entries from timestamped rows:');
  for (const [index, entry] of weeklyEntries.slice(0, 10).entries()) {
    console.log(`  ${index + 1}. ${entry.athlete_name} | ${(entry.distance / 1609.344).toFixed(1)} mi | ${entry.activity_count} rides`);
  }
  console.log('');
  console.log('Top feed-snapshot entries from all fetched rows:');
  for (const [index, entry] of feedSnapshotEntries.slice(0, 10).entries()) {
    console.log(`  ${index + 1}. ${entry.athlete_name} | ${(entry.distance / 1609.344).toFixed(1)} mi | ${entry.activity_count} rides`);
  }
}

main().catch((error) => {
  console.error('inspect-strava-week failed:', error);
  process.exitCode = 1;
});

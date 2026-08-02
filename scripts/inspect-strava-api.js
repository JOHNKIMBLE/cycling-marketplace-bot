import fs from 'node:fs/promises';
import path from 'node:path';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function parseArgs(argv) {
  const args = {
    clubId: null,
    token: process.env.STRAVA_DEBUG_ACCESS_TOKEN || process.env.STRAVA_ACCESS_TOKEN || null,
    limit: 10,
    detailCount: 5,
    outDir: 'data',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

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

    if (arg === '--limit' && next) {
      args.limit = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--details' && next) {
      args.detailCount = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--out-dir' && next) {
      args.outDir = next;
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
  node scripts/inspect-strava-api.js --club <clubId> [--token <token>] [--limit 10] [--details 5] [--out-dir data]

Token sources:
  --token <token>
  STRAVA_DEBUG_ACCESS_TOKEN
  STRAVA_ACCESS_TOKEN

Examples:
  node scripts/inspect-strava-api.js --club 1196678 --token YOUR_TOKEN --limit 10 --details 5
  STRAVA_DEBUG_ACCESS_TOKEN=YOUR_TOKEN node scripts/inspect-strava-api.js --club 1196678
`);
}

async function fetchJson(relativePath, token) {
  const response = await fetch(`${STRAVA_API_BASE}${relativePath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'KimbleBot-Strava-Debug/1.0',
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
    contentType: response.headers.get('content-type') || null,
    relativePath,
    json,
    rawBodyPreview: body.slice(0, 1000),
  };
}

function sanitizeActivity(activity) {
  return {
    topLevelKeys: Object.keys(activity || {}),
    id: activity?.id ?? null,
    name: activity?.name ?? null,
    sport_type: activity?.sport_type ?? null,
    type: activity?.type ?? null,
    distance: activity?.distance ?? null,
    moving_time: activity?.moving_time ?? null,
    total_elevation_gain: activity?.total_elevation_gain ?? null,
    start_date: activity?.start_date ?? null,
    start_date_local: activity?.start_date_local ?? null,
    athlete: activity?.athlete ?? null,
    activity: activity?.activity ?? null,
    entity: activity?.entity ?? null,
    map: activity?.map ?? null,
    photos: activity?.photos ?? null,
    primary_photo: activity?.primary_photo ?? null,
    photo_count: activity?.photo_count ?? null,
    kudos_count: activity?.kudos_count ?? null,
    comment_count: activity?.comment_count ?? null,
  };
}

function summarizeActivities(activities) {
  const summary = {
    total: activities.length,
    withTopLevelId: 0,
    withNestedActivityId: 0,
    withAnyId: 0,
    withStartDate: 0,
    withNestedStartDate: 0,
    withAthleteId: 0,
    withNestedAthleteId: 0,
    withMap: 0,
    withPhotos: 0,
    withPrimaryPhoto: 0,
  };

  for (const activity of activities) {
    const topLevelId = activity?.id;
    const nestedActivityId = activity?.activity?.id || activity?.entity?.activity?.id;
    const topLevelStart = activity?.start_date || activity?.start_date_local;
    const nestedStart = activity?.activity?.start_date || activity?.activity?.start_date_local || activity?.entity?.activity?.start_date || activity?.entity?.activity?.start_date_local;
    const athleteId = activity?.athlete?.id || activity?.athlete_id;
    const nestedAthleteId = activity?.activity?.athlete?.id || activity?.entity?.athlete?.id || activity?.entity?.activity?.athlete?.id;

    if (topLevelId) summary.withTopLevelId += 1;
    if (nestedActivityId) summary.withNestedActivityId += 1;
    if (topLevelId || nestedActivityId) summary.withAnyId += 1;
    if (topLevelStart) summary.withStartDate += 1;
    if (nestedStart) summary.withNestedStartDate += 1;
    if (athleteId) summary.withAthleteId += 1;
    if (nestedAthleteId) summary.withNestedAthleteId += 1;
    if (activity?.map || activity?.activity?.map || activity?.entity?.activity?.map) summary.withMap += 1;
    if (activity?.photos || activity?.activity?.photos || activity?.entity?.activity?.photos) summary.withPhotos += 1;
    if (activity?.primary_photo || activity?.activity?.primary_photo || activity?.entity?.activity?.primary_photo) summary.withPrimaryPhoto += 1;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.clubId || !args.token) {
    printUsage();
    if (!args.help) {
      process.exitCode = 1;
    }
    return;
  }

  const clubId = String(args.clubId).trim();
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(args.limit, 50) : 10;
  const detailCount = Number.isFinite(args.detailCount) && args.detailCount >= 0 ? Math.min(args.detailCount, 20) : 5;

  const athleteResponse = await fetchJson('/athlete', args.token);
  const clubResponse = await fetchJson(`/clubs/${clubId}`, args.token);
  const activitiesResponse = await fetchJson(`/clubs/${clubId}/activities?page=1&per_page=${limit}`, args.token);

  const activities = Array.isArray(activitiesResponse.json) ? activitiesResponse.json : [];
  const detailedActivities = [];

  for (const activity of activities.slice(0, detailCount)) {
    const activityId = activity?.id || activity?.activity?.id || activity?.entity?.activity?.id;

    if (!activityId) {
      detailedActivities.push({
        skipped: true,
        reason: 'No activity id was present in this club activity payload.',
        activityPreview: sanitizeActivity(activity),
      });
      continue;
    }

    const detailResponse = await fetchJson(`/activities/${activityId}`, args.token);
    detailedActivities.push({
      activityId,
      response: detailResponse,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    requestedClubId: clubId,
    limit,
    detailCount,
    note: 'Token intentionally omitted from this file.',
    responses: {
      athlete: athleteResponse,
      club: clubResponse,
      clubActivities: {
        ...activitiesResponse,
        summary: summarizeActivities(activities),
        firstFiveSanitized: activities.slice(0, 5).map(sanitizeActivity),
      },
      detailedActivities,
    },
  };

  const outDir = path.resolve(process.cwd(), args.outDir);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `strava-debug-${clubId}-${buildTimestamp()}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Saved Strava debug output to ${outPath}`);
  console.log('');
  console.log('Quick summary:');
  console.log(`- /athlete status: ${athleteResponse.status}`);
  console.log(`- /clubs/${clubId} status: ${clubResponse.status}`);
  console.log(`- /clubs/${clubId}/activities status: ${activitiesResponse.status}`);
  console.log(`- activity rows returned: ${activities.length}`);
  console.log(`- with top-level id: ${output.responses.clubActivities.summary.withTopLevelId}`);
  console.log(`- with nested activity id: ${output.responses.clubActivities.summary.withNestedActivityId}`);
  console.log(`- with any id: ${output.responses.clubActivities.summary.withAnyId}`);
  console.log(`- with top-level start date: ${output.responses.clubActivities.summary.withStartDate}`);
  console.log(`- with nested start date: ${output.responses.clubActivities.summary.withNestedStartDate}`);
  console.log(`- with top-level athlete id: ${output.responses.clubActivities.summary.withAthleteId}`);
  console.log(`- with nested athlete id: ${output.responses.clubActivities.summary.withNestedAthleteId}`);
  console.log(`- with map data: ${output.responses.clubActivities.summary.withMap}`);
  console.log(`- with photos data: ${output.responses.clubActivities.summary.withPhotos}`);
  console.log(`- with primary photo data: ${output.responses.clubActivities.summary.withPrimaryPhoto}`);
}

main().catch((error) => {
  console.error('Strava inspection failed:', error);
  process.exitCode = 1;
});

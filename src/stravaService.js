import crypto from 'node:crypto';
import { EmbedBuilder } from 'discord.js';
import { logDebug, logError, logInfo, logWarn } from './logger.js';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';
const STRAVA_ORANGE = 0xfc4c02;

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function formatDistance(meters) {
  if (typeof meters !== 'number') {
    return 'Unknown';
  }

  const miles = meters * 0.000621371;
  return `${miles.toFixed(1)} mi`;
}

function formatElevation(meters) {
  if (typeof meters !== 'number') {
    return 'Unknown';
  }

  const feet = meters * 3.28084;
  return `${feet.toFixed(0)} ft`;
}

function formatMovingTime(seconds) {
  if (typeof seconds !== 'number') {
    return 'Unknown';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatSportType(value) {
  if (!value) {
    return 'Ride';
  }

  if (value === 'VirtualRide') {
    return 'Virtual Ride';
  }

  return value;
}

function formatWorkoutType(value) {
  if (value == null) {
    return null;
  }

  const labels = {
    10: 'Race',
    11: 'Workout',
    12: 'Long Ride',
  };

  return labels[value] || `Workout ${value}`;
}

function formatWeekLabel(weekOffset) {
  if (weekOffset === 0) {
    return 'This Week';
  }

  if (weekOffset === 1) {
    return 'Last Week';
  }

  return `${weekOffset} Weeks Ago`;
}

function getRankEmoji(rank) {
  if (rank === 1) {
    return '🥇';
  }

  if (rank === 2) {
    return '🥈';
  }

  if (rank === 3) {
    return '🥉';
  }

  return '🚴';
}

function summarizeFeedLimitations({ hasActivityIds, hasStartTimes, hasMedia }) {
  const issues = [];

  if (!hasActivityIds) {
    issues.push('ride links');
  }

  if (!hasStartTimes) {
    issues.push('start times');
  }

  if (!hasMedia) {
    issues.push('map/photo media');
  }

  return issues;
}

function buildConstraintText(items) {
  if (items.length === 0) {
    return null;
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatStartDate(activity) {
  return pickFirst(
    activity.start_date_local,
    activity.start_date,
    activity.start_time_local,
    activity.start_time,
    activity.startDateLocal,
    activity.startDate,
    activity.startTimeLocal,
    activity.startTime,
    activity.start_date_raw,
    activity.occurred_at,
    activity.occurredAt,
    activity.created_at,
    activity.createdAt,
    activity.timestamp,
    activity.time,
    activity.time_local,
    activity.timeLocal,
    activity.date,
    activity.activity?.start_date_local,
    activity.activity?.start_date,
    activity.activity?.start_time_local,
    activity.activity?.start_time,
    activity.activity?.occurred_at,
    activity.activity?.occurredAt,
    activity.activity?.created_at,
    activity.activity?.createdAt,
    activity.activity?.timestamp,
    activity.activity?.time,
    activity.activity?.time_local,
    activity.entity?.activity?.start_date_local,
    activity.entity?.activity?.start_date,
    activity.entity?.activity?.start_time_local,
    activity.entity?.activity?.start_time,
    activity.entity?.activity?.occurred_at,
    activity.entity?.activity?.occurredAt,
    activity.entity?.activity?.created_at,
    activity.entity?.activity?.createdAt,
    activity.entity?.activity?.timestamp,
    activity.entity?.activity?.time,
    activity.entity?.activity?.time_local,
  ) || null;
}

function formatAverageSpeed(metersPerSecond) {
  if (typeof metersPerSecond !== 'number' || Number.isNaN(metersPerSecond)) {
    return 'Unknown';
  }

  const milesPerHour = metersPerSecond * 2.23694;
  return `${milesPerHour.toFixed(1)} mph`;
}

function buildLeaderboardAthleteLabel(entry) {
  return entry.athlete_name || `${entry.athlete_firstname || ''} ${entry.athlete_lastname || ''}`.trim() || 'Unknown rider';
}

function buildLeaderboardAthleteUrl(entry) {
  return entry.athlete_id ? `https://www.strava.com/athletes/${entry.athlete_id}` : null;
}

function formatDateTime(value) {
  if (!value) {
    return 'Unknown time';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    const localLikeDate = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ));

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(localLikeDate);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function extractActivityPhotoUrl(activity) {
  return pickFirst(
    activity.photos?.primary?.urls?.['600'],
    activity.photos?.primary?.urls?.['100'],
    activity.photos?.primary?.url,
    activity.primary_photo?.urls?.['600'],
    activity.primary_photo?.url,
    activity.photo_url,
    activity.entity?.activity?.photos?.primary?.urls?.['600'],
    activity.entity?.activity?.photos?.primary?.url,
  ) || null;
}

function extractActivityImageUrl(activity) {
  return pickFirst(
    extractActivityPhotoUrl(activity),
    activity.map?.photo_url,
    activity.map?.image_url,
    activity.map?.map_urls?.['400px'],
    activity.map?.map_urls?.['600px'],
    activity.entity?.activity?.map?.photo_url,
    activity.entity?.activity?.map?.image_url,
    activity.entity?.activity?.map?.map_urls?.['400px'],
    activity.entity?.activity?.map?.map_urls?.['600px'],
    activity.athlete?.profile_medium,
    activity.athlete?.profile,
  ) || null;
}

function getAthleteDisplayName(activity) {
  return pickFirst(
    activity.athlete?.fullname,
    activity.athlete?.name,
    [activity.athlete?.firstname, activity.athlete?.lastname].filter(Boolean).join(' ').trim(),
    activity.athlete_name,
  ) || 'Unknown rider';
}

function normalizeNameToken(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return normalized || null;
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
  const athleteId = activity.athlete?.id || activity.athlete_id || null;
  if (athleteId) {
    aliases.add(`id:${athleteId}`);
  }

  const candidateNames = [
    activity.athlete?.fullname,
    activity.athlete?.name,
    [activity.athlete?.firstname, activity.athlete?.lastname].filter(Boolean).join(' ').trim(),
    activity.athlete_name,
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

function resolveAthletePrimaryKey(activity, aliasToPrimaryKey) {
  const aliases = buildActivityAthleteAliases(activity);
  const existingPrimaryKey = aliases.find((alias) => aliasToPrimaryKey.has(alias));
  if (existingPrimaryKey) {
    return {
      primaryKey: aliasToPrimaryKey.get(existingPrimaryKey),
      aliases,
    };
  }

  return {
    primaryKey: aliases[0] || `activity:${activity.id || Math.random().toString(36).slice(2)}`,
    aliases,
  };
}

function getActivityRecencyScore(activity) {
  const value = formatStartDate(activity);
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sortActivitiesByRecency(activities) {
  return activities
    .map((activity, index) => ({
      activity,
      index,
      score: getActivityRecencyScore(activity),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.activity);
}

function getAthleteUrl(activity) {
  const athleteId = activity.athlete?.id || activity.athlete_id || null;
  return athleteId ? `https://www.strava.com/athletes/${athleteId}` : null;
}

function getActivityUrl(activity, clubId) {
  const activityId = pickFirst(
    activity.id,
    activity.activity_id,
    activity.activityId,
    activity.resource_id,
    activity.activity?.id,
    activity.entity?.activity?.id,
  );

  return activityId ? `https://www.strava.com/activities/${activityId}` : null;
}

function mergeActivity(summaryActivity, detailedActivity) {
  return {
    ...summaryActivity,
    ...detailedActivity,
    athlete: {
      ...(summaryActivity?.athlete || {}),
      ...(detailedActivity?.athlete || {}),
    },
    photos: detailedActivity?.photos || summaryActivity?.photos,
    map: detailedActivity?.map || summaryActivity?.map,
  };
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
    sport_type: pickFirst(activity?.sport_type, nestedActivity?.sport_type, activity?.type, nestedActivity?.type),
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
    photos: pickFirst(activity?.photos, nestedActivity?.photos),
    primary_photo: pickFirst(activity?.primary_photo, nestedActivity?.primary_photo),
    photo_count: pickFirst(activity?.photo_count, nestedActivity?.photo_count),
    map: pickFirst(activity?.map, nestedActivity?.map),
    kudos_count: pickFirst(activity?.kudos_count, nestedActivity?.kudos_count, activity?.kudosCount, nestedActivity?.kudosCount),
    comment_count: pickFirst(activity?.comment_count, nestedActivity?.comment_count, activity?.comments_count, nestedActivity?.comments_count),
  };
}

function buildAthleteKey(activity) {
  const athleteId = activity.athlete?.id || activity.athlete_id || null;
  if (athleteId) {
    return `id:${athleteId}`;
  }

  const athleteName = [activity.athlete?.firstname, activity.athlete?.lastname]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();

  if (athleteName) {
    return `name:${athleteName}`;
  }

  return `activity:${activity.id}`;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function buildBodyPreview(body) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function readJsonOrThrow(response, context = {}) {
  const contentType = response.headers.get('content-type') || 'unknown';
  const body = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${context.url || 'request'} (${contentType})${body ? `: ${buildBodyPreview(body)}` : ''}`);
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Expected JSON from ${context.url || 'request'}, got ${contentType}${body ? `: ${buildBodyPreview(body)}` : ''}`);
  }
}

function buildCacheEntry(value, ttlMs) {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
  };
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

function getTrailingDaysRange(dayCount, weekOffset = 0, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(end.getDate() - (weekOffset * 7));

  const start = new Date(end);
  start.setDate(start.getDate() - (dayCount - 1));
  start.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(end);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  return { start, end: rangeEnd };
}

function belongsToWeek(activity, start, end) {
  const activityDate = new Date(formatStartDate(activity) || 0);
  const activityMs = activityDate.getTime();
  return activityMs >= start.getTime() && activityMs < end.getTime();
}

export function aggregateLeaderboardEntries(activities) {
  const leaderboard = new Map();
  const aliasToPrimaryKey = new Map();

  for (const activity of activities) {
    const normalizedActivity = normalizeClubActivity(activity);
    if (!(Number(normalizedActivity.distance) > 0)) {
      continue;
    }

    const { primaryKey: athleteKey, aliases } = resolveAthletePrimaryKey(normalizedActivity, aliasToPrimaryKey);
    const athleteName = getAthleteDisplayName(normalizedActivity);

    const existing = leaderboard.get(athleteKey) || {
      athlete_id: normalizedActivity.athlete?.id || normalizedActivity.athlete_id || null,
      athlete_firstname: normalizedActivity.athlete?.firstname || athleteName,
      athlete_lastname: normalizedActivity.athlete?.lastname || '',
      athlete_name: athleteName,
      distance: 0,
      elevation_gain: 0,
      moving_time: 0,
      activity_count: 0,
      longest_distance: 0,
    };

    existing.distance += Number(normalizedActivity.distance) || 0;
    existing.elevation_gain += Number(normalizedActivity.total_elevation_gain) || 0;
    existing.moving_time += Number(normalizedActivity.moving_time) || 0;
    existing.activity_count += 1;
    existing.longest_distance = Math.max(existing.longest_distance, Number(normalizedActivity.distance) || 0);
    existing.athlete_id = existing.athlete_id || normalizedActivity.athlete?.id || normalizedActivity.athlete_id || null;
    if (athleteName && athleteName !== 'Unknown rider' && existing.athlete_name === 'Unknown rider') {
      existing.athlete_name = athleteName;
    }
    leaderboard.set(athleteKey, existing);
    for (const alias of aliases) {
      aliasToPrimaryKey.set(alias, athleteKey);
    }
  }

  return [...leaderboard.values()].sort((left, right) => {
    if (right.distance !== left.distance) {
      return right.distance - left.distance;
    }

    return right.elevation_gain - left.elevation_gain;
  });
}

function summarizeActivities(activities) {
  return activities.reduce((summary, activity) => ({
    distance: summary.distance + (Number(activity.distance) || 0),
    elevation: summary.elevation + (Number(activity.total_elevation_gain) || 0),
    movingTime: summary.movingTime + (Number(activity.moving_time) || 0),
  }), {
    distance: 0,
    elevation: 0,
    movingTime: 0,
  });
}

function buildEntryKey(entry) {
  if (entry.athlete_id) {
    return `id:${entry.athlete_id}`;
  }

  return `name:${buildLeaderboardAthleteLabel(entry).trim().toLowerCase()}`;
}

export function findBiggestWeekOverWeekGain(currentEntries, previousEntries) {
  const previousDistances = new Map(
    previousEntries.map((entry) => [buildEntryKey(entry), Number(entry.distance) || 0]),
  );

  let best = null;

  for (const entry of currentEntries) {
    const currentDistance = Number(entry.distance) || 0;
    const previousDistance = previousDistances.get(buildEntryKey(entry)) || 0;
    const gain = currentDistance - previousDistance;

    if (gain <= 0) {
      continue;
    }

    if (!best || gain > best.gain) {
      best = {
        entry,
        gain,
        previousDistance,
      };
    }
  }

  return best;
}

function findLongestRideActivity(activities) {
  return activities.reduce((best, activity) => {
    if (!best) {
      return activity;
    }

    return (Number(activity.distance) || 0) > (Number(best.distance) || 0) ? activity : best;
  }, null);
}

function findTopEntryBy(entries, selector) {
  return entries.reduce((best, entry) => {
    if (!best) {
      return entry;
    }

    return selector(entry) > selector(best) ? entry : best;
  }, null);
}

export class StravaService {
  constructor({
    clientId,
    clientSecret,
    redirectUri,
    oauthScopes,
    defaultClubId,
    store,
  }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.oauthScopes = oauthScopes;
    this.defaultClubId = defaultClubId;
    this.store = store;
    this.cache = new Map();
  }

  getGuildConfig(guildId) {
    return this.store.getStravaGuildConfig(guildId);
  }

  async upsertGuildConfig(config) {
    return this.store.upsertStravaGuildConfig(config);
  }

  async clearGuildConfig(guildId) {
    return this.store.removeStravaGuildConfig(guildId);
  }

  getGuildConnection(guildId) {
    return this.store.getStravaConnection(guildId);
  }

  hasGuildScope(guildId, scope) {
    const connection = this.getGuildConnection(guildId);
    return Boolean(connection?.scopes?.includes(scope));
  }

  ensureGuildScope(guildId, scope, featureLabel) {
    if (this.hasGuildScope(guildId, scope)) {
      return;
    }

    throw new Error(`${featureLabel} requires the Strava scope \`${scope}\`. Update STRAVA_OAUTH_SCOPES to include \`${scope}\`, then run \`/strava disconnect\` and \`/strava connect\` again for this server.`);
  }

  ensureOAuthConfigured() {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Strava OAuth is not fully configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI.');
    }
  }

  ensureRichStravaRuntimeConfigured() {
    if (this.oauthScopes.includes('activity:read')) {
      return;
    }

    throw new Error('This running bot is configured with STRAVA_OAUTH_SCOPES missing `activity:read`. Update the container env to `read,activity:read` and redeploy before reconnecting Strava.');
  }

  resolveClubId(explicitClubId, guildId = null) {
    return explicitClubId || this.getGuildConfig(guildId)?.defaultClubId || this.defaultClubId;
  }

  ensureClubId(explicitClubId, guildId = null) {
    const clubId = this.resolveClubId(explicitClubId, guildId);

    if (!clubId) {
      throw new Error('No Strava club ID was provided. Pass `club_id`, configure this server with `/strava setup`, or set STRAVA_DEFAULT_CLUB_ID.');
    }

    return clubId;
  }

  async createConnectSession({ guildId, guildName, requestedByUserId }) {
    this.ensureOAuthConfigured();
    this.ensureRichStravaRuntimeConfigured();
    logInfo('Creating Strava OAuth session', {
      provider: 'strava',
      guildId,
      guildName,
      requestedScopes: this.oauthScopes,
      redirectUri: this.redirectUri,
    });

    const stateId = crypto.randomUUID();
    await this.store.createStravaAuthState({
      stateId,
      guildId,
      guildName,
      requestedByUserId,
      createdAt: new Date().toISOString(),
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      approval_prompt: 'force',
      scope: this.oauthScopes.join(','),
      state: stateId,
    });

    return {
      stateId,
      url: `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`,
    };
  }

  async completeConnectSession({ stateId, code, scope, requestedByUserId = null }) {
    this.ensureOAuthConfigured();

    const authState = await this.store.consumeStravaAuthState(stateId);

    if (!authState?.guildId) {
      throw new Error('This Strava authorization session is missing or expired.');
    }

    const tokenResponse = await this.exchangeAuthorizationCode(code);
    const scopes = typeof scope === 'string' && scope.length > 0
      ? scope.split(',').map((value) => value.trim()).filter(Boolean)
      : (tokenResponse.scope || '').split(',').map((value) => value.trim()).filter(Boolean);

    await this.store.upsertStravaConnection({
      guildId: authState.guildId,
      athleteId: tokenResponse.athlete?.id ?? null,
      athleteUsername: tokenResponse.athlete?.username ?? null,
      athleteFirstName: tokenResponse.athlete?.firstname ?? null,
      athleteLastName: tokenResponse.athlete?.lastname ?? null,
      scopes,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(tokenResponse.expires_at * 1000).toISOString(),
      connectedByUserId: requestedByUserId || authState.requestedByUserId,
      connectedAt: new Date().toISOString(),
    });

    this.clearGuildCache(authState.guildId);

    return {
      guildId: authState.guildId,
      guildName: authState.guildName,
      athlete: tokenResponse.athlete,
      scopes,
      requestedScopes: this.oauthScopes,
    };
  }

  async exchangeAuthorizationCode(code) {
    logDebug('Exchanging Strava authorization code', {
      provider: 'strava',
      endpoint: `${STRAVA_OAUTH_BASE}/token`,
    });

    const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    return readJsonOrThrow(response, { url: `${STRAVA_OAUTH_BASE}/token` });
  }

  async refreshGuildToken(guildId) {
    this.ensureOAuthConfigured();

    const connection = this.getGuildConnection(guildId);
    if (!connection?.refreshToken) {
      throw new Error('This server is not connected to Strava yet. Run `/strava connect`.');
    }

    const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      }),
    });

    const tokenResponse = await readJsonOrThrow(response, { url: `${STRAVA_OAUTH_BASE}/token` });
    logInfo('Refreshed Strava access token', {
      provider: 'strava',
      guildId,
      athleteId: tokenResponse.athlete?.id ?? connection.athleteId,
    });

    await this.store.upsertStravaConnection({
      guildId,
      athleteId: tokenResponse.athlete?.id ?? connection.athleteId,
      athleteUsername: tokenResponse.athlete?.username ?? connection.athleteUsername,
      athleteFirstName: tokenResponse.athlete?.firstname ?? connection.athleteFirstName,
      athleteLastName: tokenResponse.athlete?.lastname ?? connection.athleteLastName,
      scopes: connection.scopes,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(tokenResponse.expires_at * 1000).toISOString(),
    });

    this.clearGuildCache(guildId);

    return this.getGuildConnection(guildId);
  }

  async ensureGuildAccessToken(guildId) {
    const connection = this.getGuildConnection(guildId);
    if (!connection?.accessToken) {
      throw new Error('This server is not connected to Strava yet. Run `/strava connect`.');
    }

    const expiresAtMs = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;
    if (!expiresAtMs || expiresAtMs <= Date.now() + 60_000) {
      const refreshed = await this.refreshGuildToken(guildId);
      return refreshed.accessToken;
    }

    return connection.accessToken;
  }

  async deauthorizeGuild(guildId) {
    const connection = this.getGuildConnection(guildId);
    if (!connection) {
      return false;
    }

    try {
      const accessToken = await this.ensureGuildAccessToken(guildId);
      await fetch(`${STRAVA_OAUTH_BASE}/deauthorize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Best effort: local cleanup still matters even if remote revocation fails.
    }

    await this.store.removeStravaConnection(guildId);
    this.clearGuildCache(guildId);
    return true;
  }

  getConnectionSummary(guildId) {
    const connection = this.getGuildConnection(guildId);
    if (!connection) {
      return null;
    }

    return {
      athleteId: connection.athleteId,
      athleteName: [connection.athleteFirstName, connection.athleteLastName].filter(Boolean).join(' ') || connection.athleteUsername || 'Unknown athlete',
      scopes: connection.scopes,
      expiresAt: connection.expiresAt,
      connectedAt: connection.connectedAt,
    };
  }

  getCachedValue(cacheKey) {
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.value;
  }

  setCachedValue(cacheKey, value, ttlMs) {
    this.cache.set(cacheKey, buildCacheEntry(value, ttlMs));
    return value;
  }

  clearGuildCache(guildId) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  async fetchApiJson(guildId, relativePath, { ttlMs = 0 } = {}) {
    const cacheKey = `${guildId}:api:${relativePath}`;
    if (ttlMs > 0) {
      const cached = this.getCachedValue(cacheKey);
      if (cached) {
        logDebug('Serving cached Strava API response', {
          provider: 'strava',
          guildId,
          relativePath,
          cacheKey,
        });
        return cached;
      }
    }

    let accessToken = await this.ensureGuildAccessToken(guildId);
    let retried = false;

    while (true) {
      const url = `${STRAVA_API_BASE}${relativePath}`;
      logDebug('Fetching Strava API JSON', {
        provider: 'strava',
        guildId,
        url,
        retried,
      });

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 401 && !retried) {
        retried = true;
        const refreshed = await this.refreshGuildToken(guildId);
        accessToken = refreshed.accessToken;
        continue;
      }

      const json = await readJsonOrThrow(response, { url });
      return ttlMs > 0 ? this.setCachedValue(cacheKey, json, ttlMs) : json;
    }
  }

  async fetchWebJson(guildId, url, { ttlMs = 0, headers = {}, includeGuildBearer = false } = {}) {
    const cacheKey = `${guildId}:web:${url}`;
    if (ttlMs > 0) {
      const cached = this.getCachedValue(cacheKey);
      if (cached) {
        logDebug('Serving cached Strava web response', {
          provider: 'strava',
          guildId,
          url,
          cacheKey,
        });
        return cached;
      }
    }

    const bearerHeaders = includeGuildBearer
      ? { Authorization: `Bearer ${await this.ensureGuildAccessToken(guildId)}` }
      : {};

    logDebug('Fetching Strava web JSON', {
      provider: 'strava',
      guildId,
      url,
      includeGuildBearer,
    });

    const response = await fetch(url, { headers: { ...bearerHeaders, ...headers } });
    const json = await readJsonOrThrow(response, { url });
    return ttlMs > 0 ? this.setCachedValue(cacheKey, json, ttlMs) : json;
  }

  async getClub(explicitClubId, guildId = null) {
    const clubId = this.ensureClubId(explicitClubId, guildId);
    return this.fetchApiJson(guildId, `/clubs/${clubId}`, { ttlMs: 10 * 60_000 });
  }

  async getClubActivities(explicitClubId, guildId = null, page = 1, perPage = 5) {
    const clubId = this.ensureClubId(explicitClubId, guildId);
    const activities = await this.fetchApiJson(guildId, `/clubs/${clubId}/activities?page=${page}&per_page=${perPage}`, { ttlMs: 5 * 60_000 });
    return activities.map(normalizeClubActivity);
  }

  async getActivity(activityId, guildId = null) {
    this.ensureGuildScope(guildId, 'activity:read', 'Detailed Strava activity data');
    return this.fetchApiJson(guildId, `/activities/${activityId}`, { ttlMs: 15 * 60_000 });
  }

  async hydrateActivities(activities, guildId = null, { concurrency = 4 } = {}) {
    const normalizedActivities = activities.map(normalizeClubActivity);

    if (!this.hasGuildScope(guildId, 'activity:read')) {
      return normalizedActivities;
    }

    const hydrated = await mapWithConcurrency(normalizedActivities, concurrency, async (activity) => {
      if (!activity?.id) {
        return activity;
      }

      try {
        const detail = await this.getActivity(activity.id, guildId);
        return mergeActivity(activity, detail);
      } catch (error) {
        logWarn('Unable to hydrate Strava activity detail; falling back to club summary', {
          provider: 'strava',
          guildId,
          activityId: activity.id,
          error,
        });
        return activity;
      }
    });

    return hydrated;
  }

  async getClubActivitiesForWeek(explicitClubId, guildId = null, weekOffset = 0, { perPage = 200, maxPages = 10 } = {}) {
    const clubId = this.ensureClubId(explicitClubId, guildId);
    const weekRange = getWeekRange(weekOffset);
    const matches = [];
    const allFetchedActivities = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const pageActivities = await this.getClubActivities(clubId, guildId, page, perPage);
      if (pageActivities.length === 0) {
        break;
      }

      allFetchedActivities.push(...pageActivities);

      for (const activity of pageActivities) {
        if (belongsToWeek(activity, weekRange.start, weekRange.end)) {
          matches.push(activity);
        }
      }

      const oldestActivity = pageActivities[pageActivities.length - 1];
      const oldestDate = new Date(formatStartDate(oldestActivity) || 0);
      if (oldestDate.getTime() < weekRange.start.getTime()) {
        break;
      }
    }

    logInfo('Collected Strava club activities for leaderboard aggregation', {
      provider: 'strava',
      guildId,
      clubId,
      weekOffset,
      activityCount: matches.length,
      weekStart: weekRange.start.toISOString(),
      weekEnd: weekRange.end.toISOString(),
      fetchedActivities: allFetchedActivities.length,
    });

    const activitiesWithDates = allFetchedActivities.filter((activity) => Boolean(formatStartDate(activity)));
    if (matches.length === 0 && allFetchedActivities.length > 0 && weekOffset === 0) {
      const fallbackRange = getTrailingDaysRange(7, weekOffset);
      const trailingMatches = allFetchedActivities.filter((activity) => belongsToWeek(activity, fallbackRange.start, fallbackRange.end));

      if (trailingMatches.length > 0) {
        logWarn('No current-week leaderboard entries found; falling back to trailing 7-day window', {
          provider: 'strava',
          guildId,
          clubId,
          activityCount: trailingMatches.length,
          start: fallbackRange.start.toISOString(),
          end: fallbackRange.end.toISOString(),
        });

        return trailingMatches;
      }
    }

    if (matches.length === 0 && allFetchedActivities.length > 0 && activitiesWithDates.length === 0) {
      logWarn('Club activity feed did not include usable timestamps; refusing to return misleading leaderboard totals', {
        provider: 'strava',
        guildId,
        clubId,
        fetchedActivities: allFetchedActivities.length,
      });

      throw new Error('Strava club activity API for this club does not include activity timestamps, so an exact weekly leaderboard cannot be computed from the official OAuth feed.');
    }

    return matches;
  }

  async getClubLeaderboard(explicitClubId, guildId = null, weekOffset = 0) {
    const clubId = this.ensureClubId(explicitClubId, guildId);
    const cacheKey = `${guildId}:leaderboard:${clubId}:${weekOffset}`;
    const cached = this.getCachedValue(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const activities = await this.getClubActivitiesForWeek(clubId, guildId, weekOffset);
      const entries = aggregateLeaderboardEntries(activities);
      return this.setCachedValue(cacheKey, entries, 5 * 60_000);
    } catch (error) {
      logError('Failed to build Strava leaderboard from club activities', {
        provider: 'strava',
        guildId,
        clubId,
        weekOffset,
        error,
      });
      throw error;
    }
  }

  async getClubFeedLeaderboard(explicitClubId, guildId = null, { pageCount = 12, perPage = 50 } = {}) {
    const clubId = this.ensureClubId(explicitClubId, guildId);
    const cacheKey = `${guildId}:feed-leaderboard:${clubId}:${pageCount}:${perPage}`;
    const cached = this.getCachedValue(cacheKey);
    if (cached) {
      return cached;
    }

    const activities = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const pageActivities = await this.getClubActivities(clubId, guildId, page, perPage);
      if (pageActivities.length === 0) {
        break;
      }

      activities.push(...pageActivities);

      if (pageActivities.length < perPage) {
        break;
      }
    }

    const entries = aggregateLeaderboardEntries(activities);
    logInfo('Built Strava feed leaderboard snapshot', {
      provider: 'strava',
      guildId,
      clubId,
      pageCount,
      perPage,
      activityCount: activities.length,
      rankedAthletes: entries.length,
      topEntries: entries.slice(0, 5).map((entry) => ({
        athlete: entry.athlete_name,
        distance: entry.distance,
        activityCount: entry.activity_count,
      })),
    });
    return this.setCachedValue(cacheKey, {
      entries,
      activityCount: activities.length,
    }, 5 * 60_000);
  }

  buildClubEmbed(club) {
    const embed = new EmbedBuilder()
      .setTitle(club.name || 'Strava Club')
      .setURL(`https://www.strava.com/clubs/${club.id}`)
      .setDescription(club.description || 'No description provided.')
      .addFields(
        { name: 'Members', value: `${club.member_count ?? 'Unknown'}`, inline: true },
        { name: 'Sport', value: formatSportType(club.sport_type || club.sport), inline: true },
        { name: 'Location', value: [club.city, club.state, club.country].filter(Boolean).join(', ') || 'Unknown', inline: true },
      )
      .setFooter({ text: 'Strava data' });

    if (club.profile_medium || club.profile) {
      embed.setThumbnail(club.profile_medium || club.profile);
    }

    return embed;
  }

  buildWeeklyRecapEmbeds({
    clubName,
    clubId,
    clubProfile,
    clubCoverPhoto,
    activities,
    entries,
    previousEntries = [],
    weekOffset = 0,
    mode = 'weekly',
    note = null,
  }) {
    const weekLabel = formatWeekLabel(weekOffset);
    const totals = summarizeActivities(activities);
    const topEntries = entries.slice(0, 5);
    const longestRide = findLongestRideActivity(activities);
    const mostElevation = findTopEntryBy(entries, (entry) => Number(entry.elevation_gain) || 0);
    const mostActive = findTopEntryBy(entries, (entry) => Number(entry.activity_count) || 0);
    const biggestGain = previousEntries.length > 0 ? findBiggestWeekOverWeekGain(entries, previousEntries) : null;

    const recapEmbed = new EmbedBuilder()
      .setColor(STRAVA_ORANGE)
      .setTitle(`${clubName || 'Strava Club'} Weekly Club Recap`)
      .setURL(`https://www.strava.com/clubs/${clubId}/leaderboard`)
      .setDescription([
        `Window: **${weekLabel}**`,
        mode === 'snapshot'
          ? 'Source: official recent club feed snapshot'
          : 'Source: official Strava club activity API',
      ].join('\n'))
      .setFooter({ text: mode === 'snapshot' ? 'Strava weekly recap | snapshot mode' : 'Strava weekly recap' });

    if (clubProfile) {
      recapEmbed.setThumbnail(clubProfile);
    }

    if (clubCoverPhoto) {
      recapEmbed.setImage(clubCoverPhoto);
    }

    recapEmbed.addFields(
      {
        name: 'Club Totals',
        value: [
          `Distance: \`${formatDistance(totals.distance)}\``,
          `Elevation: \`${formatElevation(totals.elevation)}\``,
          `Moving Time: \`${formatMovingTime(totals.movingTime)}\``,
          `Active Riders: \`${entries.length}\``,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Leaderboard',
        value: topEntries.length > 0
          ? topEntries.map((entry, index) => {
            const athleteUrl = buildLeaderboardAthleteUrl(entry);
            const athleteName = buildLeaderboardAthleteLabel(entry);
            return `#${index + 1} ${athleteUrl ? `[${athleteName}](${athleteUrl})` : athleteName} - \`${formatDistance(entry.distance)}\` | \`${entry.activity_count || 0} rides\``;
          }).join('\n')
          : 'No ranked riders were returned.',
        inline: true,
      },
      {
        name: 'Rider Spotlights',
        value: [
          longestRide
            ? `Longest Ride: **${getAthleteDisplayName(longestRide)}** - \`${formatDistance(longestRide.distance)}\``
            : 'Longest Ride: unavailable',
          mostElevation
            ? `Most Elevation: **${buildLeaderboardAthleteLabel(mostElevation)}** - \`${formatElevation(mostElevation.elevation_gain)}\``
            : 'Most Elevation: unavailable',
          biggestGain
            ? `Biggest Gain: **${buildLeaderboardAthleteLabel(biggestGain.entry)}** - \`+${formatDistance(biggestGain.gain)}\` vs last week`
            : 'Biggest Gain: not enough prior-week data',
          mostActive
            ? `Most Active: **${buildLeaderboardAthleteLabel(mostActive)}** - \`${mostActive.activity_count || 0} rides\``
            : 'Most Active: unavailable',
        ].join('\n'),
        inline: false,
      },
    );

    if (note) {
      recapEmbed.addFields({
        name: 'Note',
        value: note,
        inline: false,
      });
    }

    return [recapEmbed];
  }

  buildLeaderboardEmbeds({
    clubName,
    clubId,
    clubProfile,
    clubCoverPhoto,
    entries,
    weekOffset,
    mode = 'snapshot',
    note = null,
    activityCount = null,
  }) {
    const topEntries = entries.slice(0, 10);
    const weekLabel = formatWeekLabel(weekOffset);
    const topAthlete = topEntries[0] ?? null;
    const summaryEmbed = new EmbedBuilder()
      .setColor(STRAVA_ORANGE)
      .setTitle(`${clubName || 'Strava Club'} Leaderboard`)
      .setURL(`https://www.strava.com/clubs/${clubId}/leaderboard`)
      .setDescription(
        topAthlete
          ? [
              `🏆 **Top Athlete:** ${buildLeaderboardAthleteLabel(topAthlete)}`,
              `➡️ **Window:** ${weekLabel}`,
              `➡️ **Club:** ${clubName || 'Strava Club'}`,
              mode === 'snapshot'
                ? `➡️ **Source:** Official recent club feed snapshot (${activityCount ?? '?'} feed row${activityCount === 1 ? '' : 's'})`
                : '➡️ **Source:** Official Strava club activity API',
            ].join('\n')
          : `No leaderboard entries were available for ${weekLabel.toLowerCase()}.`,
      )
      .setFooter({ text: mode === 'snapshot' ? 'Strava recent-feed leaderboard snapshot' : 'Strava weekly leaderboard' });

    if (clubProfile) {
      summaryEmbed.setThumbnail(clubProfile);
    }

    if (clubCoverPhoto) {
      summaryEmbed.setImage(clubCoverPhoto);
    }

    summaryEmbed.addFields(
      { name: 'Window', value: weekLabel, inline: true },
      { name: 'Riders Ranked', value: `${entries.length}`, inline: true },
      { name: 'Rows Used', value: `${activityCount ?? '?'}`, inline: true },
    );

    if (note) {
      summaryEmbed.addFields({
        name: mode === 'snapshot' ? 'Snapshot Note' : 'Note',
        value: note,
        inline: false,
      });
    }

    if (topEntries.length === 0) {
      summaryEmbed.addFields({
        name: 'Result',
        value: 'No leaderboard entries were available for this view.',
        inline: false,
      });

      return [summaryEmbed];
    }

    for (const [index, entry] of topEntries.entries()) {
      const rank = index + 1;
      const athleteName = buildLeaderboardAthleteLabel(entry);
      const athleteUrl = buildLeaderboardAthleteUrl(entry);
      summaryEmbed.addFields({
        name: `${getRankEmoji(rank)} #${rank}. ${athleteName}`.slice(0, 256),
        value: [
          `Distance: \`${formatDistance(entry.distance)}\``,
          `Rides: \`${entry.activity_count || 0}\``,
          `Longest: \`${formatDistance(entry.longest_distance)}\``,
          `Avg Speed: \`${formatAverageSpeed(entry.moving_time > 0 ? entry.distance / entry.moving_time : null)}\``,
          `Elev Gain: \`${formatElevation(entry.elevation_gain)}\``,
          `Moving Time: \`${formatMovingTime(entry.moving_time)}\``,
          athleteUrl ? `[Athlete Profile](${athleteUrl})` : null,
        ].filter(Boolean).join('\n'),
        inline: true,
      });
    }

    return [summaryEmbed];
  }

  buildRecentActivitiesEmbed({ clubName, clubId, activities }) {
    const embed = new EmbedBuilder()
      .setTitle(`${clubName || 'Strava Club'} Recent Activities`)
      .setURL(`https://www.strava.com/clubs/${clubId}`)
      .setFooter({ text: 'Strava club digest' });

    if (activities.length === 0) {
      return embed.setDescription('No recent activities were returned.');
    }

    const totals = activities.reduce((summary, activity) => ({
      distance: summary.distance + (Number(activity.distance) || 0),
      elevation: summary.elevation + (Number(activity.total_elevation_gain) || 0),
      movingTime: summary.movingTime + (Number(activity.moving_time) || 0),
    }), { distance: 0, elevation: 0, movingTime: 0 });

    embed.setDescription([
      `Last ${activities.length} club activit${activities.length === 1 ? 'y' : 'ies'}`,
      `${formatDistance(totals.distance)} total | ${formatElevation(totals.elevation)} climbed | ${formatMovingTime(totals.movingTime)} moving time`,
    ].join('\n'));

    const heroImage = activities.map(extractActivityImageUrl).find(Boolean);
    if (heroImage) {
      embed.setImage(heroImage);
    }

    for (const activity of activities.slice(0, 25)) {
      const athleteName = activity.athlete?.firstname && activity.athlete?.lastname
        ? `${activity.athlete.firstname} ${activity.athlete.lastname}`
        : activity.athlete?.firstname || 'Unknown rider';
      const statLine = [
        `${formatSportType(activity.sport_type)}`,
        `${formatDistance(activity.distance)}`,
        `${formatElevation(activity.total_elevation_gain)}`,
        `${formatMovingTime(activity.moving_time)}`,
        `${formatAverageSpeed(activity.average_speed)}`,
      ].join(' | ');
      const socialLine = [
        `Kudos ${activity.kudos_count ?? 0}`,
        `Comments ${activity.comment_count ?? 0}`,
        `Photos ${activity.photo_count ?? 0}`,
      ].join(' | ');
      const rideUrl = activity.id ? `https://www.strava.com/activities/${activity.id}` : null;
      const imageUrl = extractActivityPhotoUrl(activity);

      embed.addFields({
        name: `${athleteName} - ${activity.name || 'Untitled activity'}`.slice(0, 256),
        value: [
          statLine,
          socialLine,
          `Started ${formatDateTime(formatStartDate(activity))}`,
          rideUrl ? `Ride ${rideUrl}` : null,
          imageUrl ? `Photo ${imageUrl}` : null,
          activity.map?.summary_polyline ? 'Map available on Strava activity page' : null,
        ].filter(Boolean).join('\n').slice(0, 1024),
        inline: false,
      });
    }

    return embed;
  }

  buildRecentActivityEmbeds({ clubName, clubId, clubProfile, clubCoverPhoto, activities }) {
    const orderedActivities = sortActivitiesByRecency(activities);

    if (orderedActivities.length === 0) {
      return [
        new EmbedBuilder()
          .setTitle(`${clubName || 'Strava Club'} Recent Activities`)
          .setURL(`https://www.strava.com/clubs/${clubId}`)
          .setDescription('No recent activities were returned.')
          .setFooter({ text: 'Strava club digest' }),
      ];
    }

    const totals = orderedActivities.reduce((summary, activity) => ({
      distance: summary.distance + (Number(activity.distance) || 0),
      elevation: summary.elevation + (Number(activity.total_elevation_gain) || 0),
      movingTime: summary.movingTime + (Number(activity.moving_time) || 0),
    }), { distance: 0, elevation: 0, movingTime: 0 });

    const summaryEmbed = new EmbedBuilder()
      .setColor(STRAVA_ORANGE)
      .setTitle(`${clubName || 'Strava Club'} Recent Activities`)
      .setURL(`https://www.strava.com/clubs/${clubId}`)
      .setDescription([
        `Last ${orderedActivities.length} club activit${orderedActivities.length === 1 ? 'y' : 'ies'}`,
        `${formatDistance(totals.distance)} total | ${formatElevation(totals.elevation)} climbed | ${formatMovingTime(totals.movingTime)} moving time`,
      ].join('\n'))
      .setFooter({ text: 'Strava official recent activity feed' });

    if (clubProfile) {
      summaryEmbed.setThumbnail(clubProfile);
    }

    const heroImage = orderedActivities.map(extractActivityImageUrl).find(Boolean);
    if (heroImage) {
      summaryEmbed.setImage(heroImage);
    } else if (clubCoverPhoto) {
      summaryEmbed.setImage(clubCoverPhoto);
    }

    const hasActivityIds = orderedActivities.some((activity) => Boolean(getActivityUrl(activity, clubId)));
    const hasStartTimes = orderedActivities.some((activity) => Boolean(formatStartDate(activity)));
    const hasMedia = orderedActivities.some((activity) => Boolean(extractActivityImageUrl(activity)));
    const limitations = summarizeFeedLimitations({ hasActivityIds, hasStartTimes, hasMedia });

    if (limitations.length > 0) {
      summaryEmbed.addFields({
        name: 'Official Feed Constraint',
        value: `Strava's club activity feed for this club does not return ${buildConstraintText(limitations)}. The cards below use the official data that is available and avoid inventing missing details.`,
        inline: false,
      });
    }

    for (const [index, activity] of orderedActivities.slice(0, 8).entries()) {
      const athleteName = getAthleteDisplayName(activity);
      const athleteUrl = getAthleteUrl(activity);
      const rideUrl = getActivityUrl(activity, clubId);
      const workoutType = formatWorkoutType(activity.workout_type);
      const statParts = [
        `Distance: \`${formatDistance(activity.distance)}\``,
        `Elevation: \`${formatElevation(activity.total_elevation_gain)}\``,
        `Moving Time: \`${formatMovingTime(activity.moving_time)}\``,
        `Avg Speed: \`${formatAverageSpeed(activity.average_speed)}\``,
        `Type: \`${formatSportType(activity.sport_type)}\``,
        workoutType ? `Workout: \`${workoutType}\`` : null,
        activity.device_name ? `Device: \`${activity.device_name}\`` : null,
        activity.elapsed_time ? `Elapsed: \`${formatMovingTime(activity.elapsed_time)}\`` : null,
        formatStartDate(activity) ? `Started: \`${formatDateTime(formatStartDate(activity))}\`` : 'Started: `Unavailable from club feed`',
        activity.kudos_count != null || activity.comment_count != null || activity.photo_count != null
          ? `Social: \`Kudos ${activity.kudos_count ?? 0} | Comments ${activity.comment_count ?? 0} | Photos ${activity.photo_count ?? 0}\``
          : null,
        athleteUrl ? `[Athlete Profile](${athleteUrl})` : null,
        rideUrl ? `[Ride Link](${rideUrl})` : null,
      ].filter(Boolean);

      summaryEmbed.addFields({
        name: `#${index + 1} ${athleteName} - ${activity.name || 'Untitled activity'}`.slice(0, 256),
        value: statParts.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    return [summaryEmbed];
  }

  buildLeaderboardUnavailableEmbeds({ clubName, clubId, clubProfile, clubCoverPhoto, weekOffset, reason, snapshotEntries = [] }) {
    const weekLabel = formatWeekLabel(weekOffset);
    const summaryEmbed = new EmbedBuilder()
      .setColor(STRAVA_ORANGE)
      .setTitle(`${clubName || 'Strava Club'} Feed Rankings`)
      .setURL(`https://www.strava.com/clubs/${clubId}/leaderboard`)
      .setDescription('The official weekly leaderboard could not be computed from the current Strava club activity feed.')
      .addFields(
        { name: 'Window', value: weekLabel, inline: true },
        { name: 'Status', value: 'Unavailable from official club feed', inline: true },
        { name: 'Reason', value: reason, inline: false },
      )
      .setFooter({ text: 'Strava leaderboard limitation' });

    if (clubProfile) {
      summaryEmbed.setThumbnail(clubProfile);
    }

    if (clubCoverPhoto) {
      summaryEmbed.setImage(clubCoverPhoto);
    }

    if (snapshotEntries.length === 0) {
      return [summaryEmbed];
    }

    return [
      summaryEmbed,
      ...this.buildLeaderboardEmbeds({
        clubName,
        clubId,
        clubProfile,
        clubCoverPhoto,
        entries: snapshotEntries,
        weekOffset,
        mode: 'snapshot',
        note: 'Snapshot rankings are aggregated from the most recent club feed rows and are not an exact weekly leaderboard.',
      }).slice(1),
    ];
  }
}



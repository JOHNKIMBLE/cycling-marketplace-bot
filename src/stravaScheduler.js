import { logError, logInfo } from './logger.js';

async function sendEmbedsToChannel(channel, embeds) {
  for (const embed of embeds) {
    await channel.send({ embeds: [embed] });
  }
}

async function sendLeaderboardDigest(stravaService, client, guildConfig) {
  if (!guildConfig.leaderboardChannelId) {
    return false;
  }

  const channel = await client.channels.fetch(guildConfig.leaderboardChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return false;
  }

  const clubId = stravaService.ensureClubId(null, guildConfig.guildId);
  const club = await stravaService.getClub(clubId, guildConfig.guildId);
  let embeds;

  try {
    const [currentActivities, previousActivities] = await Promise.all([
      stravaService.getClubActivitiesForWeek(clubId, guildConfig.guildId, 0),
      stravaService.getClubActivitiesForWeek(clubId, guildConfig.guildId, 1),
    ]);
    const currentEntries = stravaService.getCachedValue(`${guildConfig.guildId}:leaderboard:${clubId}:0`)
      || await stravaService.getClubLeaderboard(clubId, guildConfig.guildId, 0);
    const previousEntries = currentActivities.length > 0
      ? (stravaService.getCachedValue(`${guildConfig.guildId}:leaderboard:${clubId}:1`)
        || await stravaService.getClubLeaderboard(clubId, guildConfig.guildId, 1))
      : [];

    embeds = [
      ...stravaService.buildWeeklyRecapEmbeds({
        clubName: club.name,
        clubId,
        clubProfile: club.profile_medium || club.profile || null,
        clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
        activities: currentActivities,
        entries: currentEntries,
        previousEntries,
        weekOffset: 0,
        mode: 'weekly',
      }),
      ...stravaService.buildLeaderboardEmbeds({
        clubName: club.name,
        clubId,
        clubProfile: club.profile_medium || club.profile || null,
        clubCoverPhoto: null,
        entries: currentEntries,
        weekOffset: 0,
        mode: 'weekly',
        activityCount: currentActivities.length,
        note: 'Weekly rankings and spotlights are built from timestamped activities available in the official Strava club activity API.',
      }),
    ];
  } catch {
    const { entries, activityCount } = await stravaService.getClubFeedLeaderboard(clubId, guildConfig.guildId);
    embeds = [
      ...stravaService.buildWeeklyRecapEmbeds({
        clubName: club.name,
        clubId,
        clubProfile: club.profile_medium || club.profile || null,
        clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
        activities: [],
        entries,
        previousEntries: [],
        weekOffset: 0,
        mode: 'snapshot',
        note: 'This club feed does not expose enough timing data for an exact weekly board, so the recap below is based on the latest official recent-activity rows.',
      }),
      ...stravaService.buildLeaderboardEmbeds({
        clubName: club.name,
        clubId,
        clubProfile: club.profile_medium || club.profile || null,
        clubCoverPhoto: null,
        entries,
        weekOffset: 0,
        mode: 'snapshot',
        activityCount,
        note: 'This leaderboard is ranked from the official recent club activity feed returned by Strava.',
      }),
    ];
  }

  await sendEmbedsToChannel(channel, embeds);

  return true;
}

async function sendRecentActivityDigest(stravaService, client, guildConfig) {
  if (!guildConfig.recentActivityChannelId) {
    return false;
  }

  const channel = await client.channels.fetch(guildConfig.recentActivityChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return false;
  }

  const clubId = stravaService.ensureClubId(null, guildConfig.guildId);
  const [club, allActivities] = await Promise.all([
    stravaService.getClub(clubId, guildConfig.guildId),
    stravaService.getClubActivities(clubId, guildConfig.guildId, 1, 10),
  ]);
  const hydratedActivities = await stravaService.hydrateActivities(allActivities, guildConfig.guildId);

  const activities = hydratedActivities
    .filter((activity) => !guildConfig.lastRecentActivitySentAt || new Date(activity.start_date).getTime() > new Date(guildConfig.lastRecentActivitySentAt).getTime())
    .slice(0, 5);

  if (activities.length === 0) {
    return false;
  }

  const embeds = stravaService.buildRecentActivityEmbeds({
    clubName: club.name,
    clubId,
    clubProfile: club.profile_medium || club.profile || null,
    clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
    activities,
  });

  await sendEmbedsToChannel(channel, embeds);

  return true;
}

function isDue(lastSentAt, intervalMinutes, now) {
  if (!intervalMinutes) {
    return false;
  }

  if (!lastSentAt) {
    return true;
  }

  const elapsedMs = now.getTime() - new Date(lastSentAt).getTime();
  return elapsedMs >= intervalMinutes * 60_000;
}

export class StravaScheduler {
  constructor({ client, store, stravaService, pollIntervalMs = 60_000 }) {
    this.client = client;
    this.store = store;
    this.stravaService = stravaService;
    this.pollIntervalMs = pollIntervalMs;
    this.timer = null;
    this.isRunning = false;
  }

  start() {
    if (this.timer) {
      return;
    }

      this.timer = setInterval(() => {
      this.tick().catch((error) => {
        logError('Strava scheduler tick failed', {
          component: 'stravaScheduler',
          error,
        });
      });
    }, this.pollIntervalMs);

    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const configs = this.store.getStravaGuildConfigs();
      const now = new Date();

      for (const config of configs) {
        if (!config.defaultClubId) {
          continue;
        }

        await this.runGuildDigest(config.guildId, 'leaderboard', { dueOnly: true, now });
        await this.runGuildDigest(config.guildId, 'recent_activity', { dueOnly: true, now });
      }
    } finally {
      this.isRunning = false;
    }
  }

  async runGuildDigest(guildId, kind, { dueOnly = false, now = new Date() } = {}) {
    const config = this.store.getStravaGuildConfig(guildId);

    if (!config?.defaultClubId) {
      return false;
    }

    if (kind === 'leaderboard') {
      if (dueOnly && !isDue(config.lastLeaderboardSentAt, config.leaderboardIntervalMinutes, now)) {
        return false;
      }

      const sent = await sendLeaderboardDigest(this.stravaService, this.client, config);
      if (sent) {
        logInfo('Sent Strava leaderboard digest', {
          component: 'stravaScheduler',
          guildId,
          clubId: config.defaultClubId,
        });
        await this.store.upsertStravaGuildConfig({
          guildId,
          lastLeaderboardSentAt: now.toISOString(),
        });
      }

      return sent;
    }

    if (kind === 'recent_activity') {
      if (dueOnly && !isDue(config.lastRecentActivitySentAt, config.recentActivityIntervalMinutes, now)) {
        return false;
      }

      const sent = await sendRecentActivityDigest(this.stravaService, this.client, config);
      if (sent) {
        logInfo('Sent Strava recent activity digest', {
          component: 'stravaScheduler',
          guildId,
          clubId: config.defaultClubId,
        });
        await this.store.upsertStravaGuildConfig({
          guildId,
          lastRecentActivitySentAt: now.toISOString(),
        });
      }

      return sent;
    }

    throw new Error(`Unknown digest kind: ${kind}`);
  }
}

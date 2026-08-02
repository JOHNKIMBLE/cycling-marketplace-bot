import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = {
  destinations: {},
  watchedForums: {},
  mirroredThreads: {},
  stravaGuilds: {},
  stravaConnections: {},
  stravaAuthStates: {},
  weatherGuilds: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMirrorRecord(sourceThreadId, record) {
  if (!record) {
    return {
      sourceThreadId,
      listingFingerprint: null,
      sourceSellerUserId: null,
      sourceSellerName: null,
      sourceToMirrorRelays: {},
      mirrorToSourceRelays: {},
      mirrors: {},
    };
  }

  if (record.mirrors && typeof record.mirrors === 'object') {
    return {
      ...record,
      sourceThreadId,
      listingFingerprint: record.listingFingerprint ?? null,
      sourceSellerUserId: record.sourceSellerUserId ?? null,
      sourceSellerName: record.sourceSellerName ?? null,
      sourceToMirrorRelays: record.sourceToMirrorRelays ?? {},
      mirrorToSourceRelays: record.mirrorToSourceRelays ?? {},
      mirrors: { ...record.mirrors },
    };
  }

  const destinationForumChannelId = record.targetForumChannelId || 'legacy-destination';

  return {
    sourceThreadId,
    listingFingerprint: null,
    sourceGuildId: record.sourceGuildId ?? null,
    sourceForumChannelId: record.sourceForumChannelId ?? null,
    sourceThreadName: record.sourceThreadName ?? null,
    sourceSellerUserId: null,
    sourceSellerName: null,
    sourceToMirrorRelays: {},
    mirrorToSourceRelays: {},
    mirrors: {
      [destinationForumChannelId]: {
        destinationGuildId: record.destinationGuildId ?? null,
        destinationForumChannelId,
        targetThreadId: record.targetThreadId ?? null,
        mirroredAt: record.mirroredAt ?? null,
      },
    },
  };
}

function normalizeStravaGuildConfig(guildId, record) {
  return {
    guildId,
    guildName: record?.guildName ?? null,
    defaultClubId: record?.defaultClubId ?? null,
    leaderboardChannelId: record?.leaderboardChannelId ?? null,
    recentActivityChannelId: record?.recentActivityChannelId ?? null,
    leaderboardIntervalMinutes: record?.leaderboardIntervalMinutes ?? 1440,
    recentActivityIntervalMinutes: record?.recentActivityIntervalMinutes ?? 360,
    lastLeaderboardSentAt: record?.lastLeaderboardSentAt ?? null,
    lastRecentActivitySentAt: record?.lastRecentActivitySentAt ?? null,
    configuredByUserId: record?.configuredByUserId ?? null,
    configuredAt: record?.configuredAt ?? null,
  };
}

function normalizeStravaConnection(guildId, record) {
  return {
    guildId,
    athleteId: record?.athleteId ?? null,
    athleteUsername: record?.athleteUsername ?? null,
    athleteFirstName: record?.athleteFirstName ?? null,
    athleteLastName: record?.athleteLastName ?? null,
    scopes: record?.scopes ?? [],
    accessToken: record?.accessToken ?? null,
    refreshToken: record?.refreshToken ?? null,
    expiresAt: record?.expiresAt ?? null,
    connectedByUserId: record?.connectedByUserId ?? null,
    connectedAt: record?.connectedAt ?? null,
  };
}

function normalizeStravaAuthState(stateId, record) {
  return {
    stateId,
    guildId: record?.guildId ?? null,
    guildName: record?.guildName ?? null,
    requestedByUserId: record?.requestedByUserId ?? null,
    createdAt: record?.createdAt ?? null,
  };
}

function normalizeWeatherGuildConfig(guildId, record) {
  const legacyBeginningLabel = record?.beginningLabel ?? record?.locationLabel ?? null;
  const legacyBeginningLatitude = record?.beginningLatitude ?? record?.latitude ?? null;
  const legacyBeginningLongitude = record?.beginningLongitude ?? record?.longitude ?? null;
  const legacyBeginningAdmin1 = record?.beginningAdmin1 ?? record?.admin1 ?? null;
  const legacyBeginningCountryCode = record?.beginningCountryCode ?? record?.countryCode ?? null;
  const legacyBeginningTimezone = record?.beginningTimezone ?? record?.timezone ?? null;
  const legacyBeginningMapsUrl = record?.beginningMapsUrl ?? record?.mapsUrl ?? null;
  const legacyBeginningQuery = record?.beginningQuery ?? record?.locationQuery ?? null;

  return {
    guildId,
    guildName: record?.guildName ?? null,
    beginningQuery: legacyBeginningQuery,
    beginningLabel: legacyBeginningLabel,
    beginningLatitude: Number.isFinite(Number(legacyBeginningLatitude)) ? Number(legacyBeginningLatitude) : null,
    beginningLongitude: Number.isFinite(Number(legacyBeginningLongitude)) ? Number(legacyBeginningLongitude) : null,
    beginningAdmin1: legacyBeginningAdmin1,
    beginningCountryCode: legacyBeginningCountryCode,
    beginningTimezone: legacyBeginningTimezone,
    beginningMapsUrl: legacyBeginningMapsUrl,
    endQuery: record?.endQuery ?? null,
    endLabel: record?.endLabel ?? null,
    endLatitude: Number.isFinite(Number(record?.endLatitude)) ? Number(record.endLatitude) : null,
    endLongitude: Number.isFinite(Number(record?.endLongitude)) ? Number(record.endLongitude) : null,
    endAdmin1: record?.endAdmin1 ?? null,
    endCountryCode: record?.endCountryCode ?? null,
    endTimezone: record?.endTimezone ?? null,
    endMapsUrl: record?.endMapsUrl ?? null,
    directionsUrl: record?.directionsUrl ?? null,
    weatherChannelId: record?.weatherChannelId ?? null,
    weatherDays: Array.isArray(record?.weatherDays) ? record.weatherDays : [],
    weatherTimeLocal: record?.weatherTimeLocal ?? null,
    weatherView: record?.weatherView ?? 'three_hour',
    weatherAlertMode: record?.weatherAlertMode ?? 'bad_only',
    lastWeatherAlertKey: record?.lastWeatherAlertKey ?? null,
    configuredByUserId: record?.configuredByUserId ?? null,
    configuredAt: record?.configuredAt ?? null,
  };
}

export class MarketplaceStore {
  #filePath;

  #backupFilePath;

  #state = clone(DEFAULT_STATE);

  #writeChain = Promise.resolve();

  constructor(filePath) {
    this.#filePath = filePath;
    this.#backupFilePath = `${filePath}.bak`;
  }

  async load() {
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.#filePath, 'utf8');
      this.#state = this.#normalizeLoadedState(JSON.parse(raw));

      const backupSummary = await this.#readBackupSummary();

      return {
        filePath: this.#filePath,
        backupFilePath: this.#backupFilePath,
        source: 'existing',
        sizeBytes: Buffer.byteLength(raw, 'utf8'),
        backupSummary,
        ...this.getStateSummary(),
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.#persist();

      const backupSummary = await this.#readBackupSummary();

      return {
        filePath: this.#filePath,
        backupFilePath: this.#backupFilePath,
        source: 'created-default',
        sizeBytes: 0,
        backupSummary,
        ...this.getStateSummary(),
      };
    }
  }

  getStateSummary() {
    return {
      destinationCount: Object.keys(this.#state.destinations).length,
      watchedForumCount: Object.keys(this.#state.watchedForums).length,
      mirroredThreadCount: Object.keys(this.#state.mirroredThreads).length,
      stravaGuildCount: Object.keys(this.#state.stravaGuilds).length,
      stravaConnectionCount: Object.keys(this.#state.stravaConnections).length,
      weatherGuildCount: Object.keys(this.#state.weatherGuilds).length,
    };
  }

  getDestination(guildId) {
    const destination = this.#state.destinations[guildId];
    return destination ? clone(destination) : null;
  }

  getDestinations() {
    return Object.values(this.#state.destinations).map((entry) => clone(entry));
  }

  async upsertDestination(destination) {
    this.#state.destinations[destination.guildId] = clone(destination);
    await this.#persist();
    return this.getDestination(destination.guildId);
  }

  async removeDestination(guildId) {
    const existing = this.getDestination(guildId);
    delete this.#state.destinations[guildId];
    await this.#persist();
    return existing;
  }

  getWatchedForum(forumChannelId) {
    const watchedForum = this.#state.watchedForums[forumChannelId];
    return watchedForum ? clone(watchedForum) : null;
  }

  getWatchedForums() {
    return Object.values(this.#state.watchedForums).map((entry) => clone(entry));
  }

  getWatchedForumsForGuild(guildId) {
    return this.getWatchedForums().filter((entry) => entry.guildId === guildId);
  }

  async upsertWatchedForum(watchedForum) {
    this.#state.watchedForums[watchedForum.forumChannelId] = clone(watchedForum);
    await this.#persist();
    return this.getWatchedForum(watchedForum.forumChannelId);
  }

  async removeWatchedForum(forumChannelId) {
    const existing = this.getWatchedForum(forumChannelId);
    delete this.#state.watchedForums[forumChannelId];
    await this.#persist();
    return existing;
  }

  getMirrorRecord(sourceThreadId) {
    const mirror = this.#state.mirroredThreads[sourceThreadId];
    return mirror ? clone(mirror) : null;
  }

  getMirrorRecords() {
    return Object.values(this.#state.mirroredThreads).map((entry) => clone(entry));
  }

  findMirrorRecordByFingerprint(listingFingerprint, excludeSourceThreadId = null) {
    if (!listingFingerprint) {
      return null;
    }

    const record = Object.values(this.#state.mirroredThreads).find((mirrorRecord) =>
      mirrorRecord.listingFingerprint
      && mirrorRecord.listingFingerprint === listingFingerprint
      && mirrorRecord.sourceThreadId !== excludeSourceThreadId
    );

    return record ? clone(record) : null;
  }

  getMirrorRecordByTargetThreadId(targetThreadId) {
    const record = Object.values(this.#state.mirroredThreads).find((mirrorRecord) =>
      Object.values(mirrorRecord.mirrors ?? {}).some((mirror) => mirror.targetThreadId === targetThreadId),
    );

    return record ? clone(record) : null;
  }

  hasMirrorForDestination(sourceThreadId, destinationForumChannelId) {
    return Boolean(this.#state.mirroredThreads[sourceThreadId]?.mirrors?.[destinationForumChannelId]);
  }

  hasSourceToMirrorRelay(sourceThreadId, sourceMessageId, targetThreadId) {
    return Boolean(this.#state.mirroredThreads[sourceThreadId]?.sourceToMirrorRelays?.[sourceMessageId]?.[targetThreadId]);
  }

  hasMirrorToSourceRelay(sourceThreadId, mirrorMessageId) {
    return Boolean(this.#state.mirroredThreads[sourceThreadId]?.mirrorToSourceRelays?.[mirrorMessageId]);
  }

  async recordMirror(record) {
    const existing = normalizeMirrorRecord(record.sourceThreadId, this.#state.mirroredThreads[record.sourceThreadId]);

    this.#state.mirroredThreads[record.sourceThreadId] = {
      ...existing,
      sourceThreadId: record.sourceThreadId,
      listingFingerprint: record.listingFingerprint ?? existing.listingFingerprint ?? null,
      sourceGuildId: record.sourceGuildId,
      sourceForumChannelId: record.sourceForumChannelId,
      sourceThreadName: record.sourceThreadName,
      sourceSellerUserId: record.sourceSellerUserId ?? existing.sourceSellerUserId,
      sourceSellerName: record.sourceSellerName ?? existing.sourceSellerName,
      mirrors: {
        ...existing.mirrors,
        [record.destinationForumChannelId]: {
          destinationGuildId: record.destinationGuildId,
          destinationForumChannelId: record.destinationForumChannelId,
          targetThreadId: record.targetThreadId,
          mirroredAt: record.mirroredAt,
        },
      },
    };

    await this.#persist();
    return this.getMirrorRecord(record.sourceThreadId);
  }

  async recordSourceToMirrorRelay({
    sourceThreadId,
    sourceMessageId,
    targetThreadId,
    relayedMessageId,
  }) {
    const existing = normalizeMirrorRecord(sourceThreadId, this.#state.mirroredThreads[sourceThreadId]);
    const relayBucket = existing.sourceToMirrorRelays[sourceMessageId] ?? {};

    this.#state.mirroredThreads[sourceThreadId] = {
      ...existing,
      sourceToMirrorRelays: {
        ...existing.sourceToMirrorRelays,
        [sourceMessageId]: {
          ...relayBucket,
          [targetThreadId]: relayedMessageId,
        },
      },
    };

    await this.#persist();
  }

  async recordMirrorToSourceRelay({
    sourceThreadId,
    mirrorMessageId,
    sourceRelayMessageId,
  }) {
    const existing = normalizeMirrorRecord(sourceThreadId, this.#state.mirroredThreads[sourceThreadId]);

    this.#state.mirroredThreads[sourceThreadId] = {
      ...existing,
      mirrorToSourceRelays: {
        ...existing.mirrorToSourceRelays,
        [mirrorMessageId]: sourceRelayMessageId,
      },
    };

    await this.#persist();
  }

  getStravaGuildConfig(guildId) {
    const config = this.#state.stravaGuilds[guildId];
    return config ? clone(config) : null;
  }

  getStravaGuildConfigs() {
    return Object.values(this.#state.stravaGuilds).map((entry) => clone(entry));
  }

  async upsertStravaGuildConfig(config) {
    this.#state.stravaGuilds[config.guildId] = normalizeStravaGuildConfig(config.guildId, {
      ...this.#state.stravaGuilds[config.guildId],
      ...clone(config),
    });
    await this.#persist();
    return this.getStravaGuildConfig(config.guildId);
  }

  async removeStravaGuildConfig(guildId) {
    const existing = this.getStravaGuildConfig(guildId);
    delete this.#state.stravaGuilds[guildId];
    await this.#persist();
    return existing;
  }

  getStravaConnection(guildId) {
    const connection = this.#state.stravaConnections[guildId];
    return connection ? clone(connection) : null;
  }

  async upsertStravaConnection(connection) {
    this.#state.stravaConnections[connection.guildId] = normalizeStravaConnection(connection.guildId, {
      ...this.#state.stravaConnections[connection.guildId],
      ...clone(connection),
    });
    await this.#persist();
    return this.getStravaConnection(connection.guildId);
  }

  async removeStravaConnection(guildId) {
    const existing = this.getStravaConnection(guildId);
    delete this.#state.stravaConnections[guildId];
    await this.#persist();
    return existing;
  }

  getStravaAuthState(stateId) {
    const authState = this.#state.stravaAuthStates[stateId];
    return authState ? clone(authState) : null;
  }

  async createStravaAuthState(authState) {
    this.#state.stravaAuthStates[authState.stateId] = normalizeStravaAuthState(authState.stateId, authState);
    await this.#persist();
    return this.getStravaAuthState(authState.stateId);
  }

  async consumeStravaAuthState(stateId) {
    const existing = this.getStravaAuthState(stateId);
    delete this.#state.stravaAuthStates[stateId];
    await this.#persist();
    return existing;
  }

  getWeatherGuildConfig(guildId) {
    const config = this.#state.weatherGuilds[guildId];
    return config ? clone(config) : null;
  }

  getWeatherGuildConfigs() {
    return Object.values(this.#state.weatherGuilds).map((entry) => clone(entry));
  }

  async upsertWeatherGuildConfig(config) {
    this.#state.weatherGuilds[config.guildId] = normalizeWeatherGuildConfig(config.guildId, {
      ...this.#state.weatherGuilds[config.guildId],
      ...clone(config),
    });
    await this.#persist();
    return this.getWeatherGuildConfig(config.guildId);
  }

  async removeWeatherGuildConfig(guildId) {
    const existing = this.getWeatherGuildConfig(guildId);
    delete this.#state.weatherGuilds[guildId];
    await this.#persist();
    return existing;
  }

  async #persist() {
    const snapshot = JSON.stringify(this.#state, null, 2);
    const tempFilePath = `${this.#filePath}.tmp`;

    this.#writeChain = this.#writeChain.then(async () => {
      try {
        await fs.copyFile(this.#filePath, this.#backupFilePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      await fs.writeFile(tempFilePath, snapshot, 'utf8');
      await fs.rename(tempFilePath, this.#filePath);
    });
    await this.#writeChain;
  }

  #normalizeLoadedState(parsed) {
    const destinations = parsed?.destinations ?? {};

    if (parsed?.target?.guildId && !destinations[parsed.target.guildId]) {
      destinations[parsed.target.guildId] = clone(parsed.target);
    }

    const mirroredThreads = Object.fromEntries(
      Object.entries(parsed?.mirroredThreads ?? {}).map(([sourceThreadId, record]) => [
        sourceThreadId,
        normalizeMirrorRecord(sourceThreadId, record),
      ]),
    );

    const stravaGuilds = Object.fromEntries(
      Object.entries(parsed?.stravaGuilds ?? {}).map(([guildId, record]) => [
        guildId,
        normalizeStravaGuildConfig(guildId, record),
      ]),
    );

    const stravaConnections = Object.fromEntries(
      Object.entries(parsed?.stravaConnections ?? {}).map(([guildId, record]) => [
        guildId,
        normalizeStravaConnection(guildId, record),
      ]),
    );

    const stravaAuthStates = Object.fromEntries(
      Object.entries(parsed?.stravaAuthStates ?? {}).map(([stateId, record]) => [
        stateId,
        normalizeStravaAuthState(stateId, record),
      ]),
    );

    const weatherGuilds = Object.fromEntries(
      Object.entries(parsed?.weatherGuilds ?? {}).map(([guildId, record]) => [
        guildId,
        normalizeWeatherGuildConfig(guildId, record),
      ]),
    );

    return {
      ...clone(DEFAULT_STATE),
      ...parsed,
      destinations,
      watchedForums: parsed?.watchedForums ?? {},
      mirroredThreads,
      stravaGuilds,
      stravaConnections,
      stravaAuthStates,
      weatherGuilds,
    };
  }

  async #readBackupSummary() {
    try {
      const raw = await fs.readFile(this.#backupFilePath, 'utf8');
      const parsed = this.#normalizeLoadedState(JSON.parse(raw));
      return {
        exists: true,
        sizeBytes: Buffer.byteLength(raw, 'utf8'),
        destinationCount: Object.keys(parsed.destinations ?? {}).length,
        watchedForumCount: Object.keys(parsed.watchedForums ?? {}).length,
        mirroredThreadCount: Object.keys(parsed.mirroredThreads ?? {}).length,
        stravaGuildCount: Object.keys(parsed.stravaGuilds ?? {}).length,
        stravaConnectionCount: Object.keys(parsed.stravaConnections ?? {}).length,
        weatherGuildCount: Object.keys(parsed.weatherGuilds ?? {}).length,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { exists: false };
      }

      return {
        exists: true,
        unreadable: true,
        error: error.message,
      };
    }
  }
}

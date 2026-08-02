import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { MarketplaceStore } from '../src/store.js';

async function createTempStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kimble-store-'));
  return {
    tempDir,
    filePath: path.join(tempDir, 'state.json'),
  };
}

test('MarketplaceStore migrates a legacy single-target state into destinations', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    await fs.writeFile(filePath, JSON.stringify({
      target: {
        guildId: 'guild-1',
        guildName: 'Team Alpha',
        forumChannelId: 'forum-1',
        forumChannelName: 'store',
      },
      watchedForums: {},
      mirroredThreads: {},
    }));

    const store = new MarketplaceStore(filePath);
    await store.load();

    assert.deepEqual(store.getDestination('guild-1'), {
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      forumChannelId: 'forum-1',
      forumChannelName: 'store',
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore records mirrors per destination forum', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.recordMirror({
      sourceThreadId: 'source-1',
      sourceGuildId: 'guild-source',
      sourceForumChannelId: 'forum-source',
      sourceThreadName: 'Wheelset for sale',
      destinationGuildId: 'guild-a',
      destinationForumChannelId: 'forum-a',
      targetThreadId: 'thread-a',
      mirroredAt: '2026-04-06T21:00:00.000Z',
    });

    await store.recordMirror({
      sourceThreadId: 'source-1',
      sourceGuildId: 'guild-source',
      sourceForumChannelId: 'forum-source',
      sourceThreadName: 'Wheelset for sale',
      destinationGuildId: 'guild-b',
      destinationForumChannelId: 'forum-b',
      targetThreadId: 'thread-b',
      mirroredAt: '2026-04-06T21:01:00.000Z',
    });

    assert.equal(store.hasMirrorForDestination('source-1', 'forum-a'), true);
    assert.equal(store.hasMirrorForDestination('source-1', 'forum-b'), true);
    assert.equal(store.getMirrorRecord('source-1').mirrors['forum-b'].targetThreadId, 'thread-b');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore persists Strava guild config per server', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.upsertStravaGuildConfig({
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      defaultClubId: '12345',
      leaderboardChannelId: 'leaderboard-channel',
      recentActivityChannelId: 'activity-channel',
    });

    assert.deepEqual(store.getStravaGuildConfig('guild-1'), {
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      defaultClubId: '12345',
      leaderboardChannelId: 'leaderboard-channel',
      recentActivityChannelId: 'activity-channel',
      leaderboardIntervalMinutes: 1440,
      recentActivityIntervalMinutes: 360,
      lastLeaderboardSentAt: null,
      lastRecentActivitySentAt: null,
      configuredByUserId: null,
      configuredAt: null,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore persists Strava OAuth connections per server', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.upsertStravaConnection({
      guildId: 'guild-1',
      athleteId: 42,
      athleteFirstName: 'Chris',
      athleteLastName: 'Egan',
      scopes: ['read'],
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: '2026-04-07T00:00:00.000Z',
    });

    assert.deepEqual(store.getStravaConnection('guild-1'), {
      guildId: 'guild-1',
      athleteId: 42,
      athleteUsername: null,
      athleteFirstName: 'Chris',
      athleteLastName: 'Egan',
      scopes: ['read'],
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: '2026-04-07T00:00:00.000Z',
      connectedByUserId: null,
      connectedAt: null,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore can consume Strava auth state once', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.createStravaAuthState({
      stateId: 'state-1',
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      requestedByUserId: 'user-1',
      createdAt: '2026-04-06T23:00:00.000Z',
    });

    const first = await store.consumeStravaAuthState('state-1');
    const second = await store.consumeStravaAuthState('state-1');

    assert.equal(first.guildId, 'guild-1');
    assert.equal(second, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore persists weather meetup location and automation per server', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.upsertWeatherGuildConfig({
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      beginningQuery: 'Walgreens Bryn Mawr and Clark, Chicago',
      beginningLabel: 'Walgreens, Chicago, US',
      beginningLatitude: 41.983,
      beginningLongitude: -87.659,
      beginningTimezone: 'America/Chicago',
      endQuery: 'Foster Beach, Chicago',
      endLabel: 'Foster Beach, Chicago, US',
      endLatitude: 41.976,
      endLongitude: -87.648,
      directionsUrl: 'https://www.google.com/maps/dir/?api=1',
      weatherChannelId: 'channel-1',
      weatherDays: ['saturday', 'sunday'],
      weatherTimeLocal: '07:30',
      weatherView: 'three_hour',
      weatherAlertMode: 'bad_only',
    });

    assert.deepEqual(store.getWeatherGuildConfig('guild-1'), {
      guildId: 'guild-1',
      guildName: 'Team Alpha',
      beginningQuery: 'Walgreens Bryn Mawr and Clark, Chicago',
      beginningLabel: 'Walgreens, Chicago, US',
      beginningLatitude: 41.983,
      beginningLongitude: -87.659,
      beginningAdmin1: null,
      beginningCountryCode: null,
      beginningTimezone: 'America/Chicago',
      beginningMapsUrl: null,
      endQuery: 'Foster Beach, Chicago',
      endLabel: 'Foster Beach, Chicago, US',
      endLatitude: 41.976,
      endLongitude: -87.648,
      endAdmin1: null,
      endCountryCode: null,
      endTimezone: null,
      endMapsUrl: null,
      directionsUrl: 'https://www.google.com/maps/dir/?api=1',
      weatherChannelId: 'channel-1',
      weatherDays: ['saturday', 'sunday'],
      weatherTimeLocal: '07:30',
      weatherView: 'three_hour',
      weatherAlertMode: 'bad_only',
      lastWeatherAlertKey: null,
      configuredByUserId: null,
      configuredAt: null,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('MarketplaceStore can look up mirror records by target thread id and track relays', async () => {
  const { tempDir, filePath } = await createTempStore();

  try {
    const store = new MarketplaceStore(filePath);
    await store.load();

    await store.recordMirror({
      sourceThreadId: 'source-1',
      sourceGuildId: 'guild-source',
      sourceForumChannelId: 'forum-source',
      sourceThreadName: 'Frameset for sale',
      sourceSellerUserId: 'seller-1',
      sourceSellerName: 'Chris',
      destinationGuildId: 'guild-a',
      destinationForumChannelId: 'forum-a',
      targetThreadId: 'thread-a',
      mirroredAt: '2026-04-06T21:00:00.000Z',
    });

    await store.recordMirrorToSourceRelay({
      sourceThreadId: 'source-1',
      mirrorMessageId: 'mirror-msg-1',
      sourceRelayMessageId: 'source-relay-1',
    });

    await store.recordSourceToMirrorRelay({
      sourceThreadId: 'source-1',
      sourceMessageId: 'source-msg-1',
      targetThreadId: 'thread-a',
      relayedMessageId: 'mirror-relay-1',
    });

    assert.equal(store.getMirrorRecordByTargetThreadId('thread-a').sourceThreadId, 'source-1');
    assert.equal(store.hasMirrorToSourceRelay('source-1', 'mirror-msg-1'), true);
    assert.equal(store.hasSourceToMirrorRelay('source-1', 'source-msg-1', 'thread-a'), true);
    assert.equal(store.getMirrorRecord('source-1').sourceSellerUserId, 'seller-1');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateLeaderboardEntries, findBiggestWeekOverWeekGain } from '../src/stravaService.js';

test('aggregateLeaderboardEntries combines weekly activities per athlete and sorts by distance', () => {
  const entries = aggregateLeaderboardEntries([
    {
      athlete: { id: 1, firstname: 'Chris', lastname: 'Egan' },
      distance: 40000,
      total_elevation_gain: 500,
      moving_time: 3600,
    },
    {
      athlete: { id: 2, firstname: 'Alex', lastname: 'M' },
      distance: 30000,
      total_elevation_gain: 900,
      moving_time: 3200,
    },
    {
      athlete: { id: 1, firstname: 'Chris', lastname: 'Egan' },
      distance: 25000,
      total_elevation_gain: 250,
      moving_time: 2400,
    },
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].athlete_id, 1);
  assert.equal(entries[0].distance, 65000);
  assert.equal(entries[0].elevation_gain, 750);
  assert.equal(entries[0].moving_time, 6000);
  assert.equal(entries[0].activity_count, 2);
});

test('aggregateLeaderboardEntries handles nested club activity payloads', () => {
  const entries = aggregateLeaderboardEntries([
    {
      athlete: { firstname: 'Ignored', lastname: 'Name' },
      activity: {
        id: 101,
        distance: 16093.4,
        total_elevation_gain: 100,
        moving_time: 1800,
        athlete: { id: 7, firstname: 'Connor', lastname: 'Egan' },
      },
    },
    {
      activity: {
        id: 102,
        distance: 32186.8,
        total_elevation_gain: 200,
        moving_time: 3600,
        athlete: { id: 7, firstname: 'Connor', lastname: 'Egan' },
      },
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].athlete_id, 7);
  assert.equal(entries[0].athlete_name, 'Connor Egan');
  assert.equal(entries[0].activity_count, 2);
  assert.equal(entries[0].distance, 48280.2);
  assert.equal(entries[0].elevation_gain, 300);
  assert.equal(entries[0].moving_time, 5400);
  assert.equal(entries[0].longest_distance, 32186.8);
});

test('aggregateLeaderboardEntries merges rows when the same athlete appears as full name and initial-only name', () => {
  const entries = aggregateLeaderboardEntries([
    {
      athlete: { firstname: 'Sean', lastname: 'Scott' },
      distance: 40000,
      total_elevation_gain: 300,
      moving_time: 3600,
    },
    {
      athlete_name: 'Sean S.',
      athlete: { firstname: 'Sean', lastname: 'S.' },
      distance: 25000,
      total_elevation_gain: 150,
      moving_time: 2000,
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].athlete_name, 'Sean Scott');
  assert.equal(entries[0].distance, 65000);
  assert.equal(entries[0].activity_count, 2);
  assert.equal(entries[0].longest_distance, 40000);
});

test('findBiggestWeekOverWeekGain compares current and prior entries by athlete', () => {
  const gain = findBiggestWeekOverWeekGain(
    [
      { athlete_id: 1, athlete_name: 'Connor Egan', distance: 80000 },
      { athlete_id: 2, athlete_name: 'Alex M', distance: 50000 },
    ],
    [
      { athlete_id: 1, athlete_name: 'Connor Egan', distance: 60000 },
      { athlete_id: 2, athlete_name: 'Alex M', distance: 49000 },
    ],
  );

  assert.equal(gain.entry.athlete_id, 1);
  assert.equal(gain.gain, 20000);
  assert.equal(gain.previousDistance, 60000);
});

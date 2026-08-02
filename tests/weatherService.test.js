import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeWeatherCode,
  directionToArrow,
  directionToCardinal,
  evaluateRideAlert,
  resolveForecastPeriod,
  selectForecastRows,
} from '../src/weatherService.js';

test('directionToCardinal maps wind headings to compass labels', () => {
  assert.equal(directionToCardinal(0), 'N');
  assert.equal(directionToCardinal(45), 'NE');
  assert.equal(directionToCardinal(225), 'SW');
});

test('directionToArrow maps wind headings to arrows', () => {
  assert.equal(directionToArrow(0), '^');
  assert.equal(directionToArrow(90), '>');
  assert.equal(directionToArrow(270), '<');
});

test('describeWeatherCode returns a friendly weather label', () => {
  assert.equal(describeWeatherCode(3), 'Overcast');
  assert.equal(describeWeatherCode(95), 'Thunderstorm');
});

test('selectForecastRows returns every third hour for three-hour view', () => {
  const rows = [
    { time: '2026-04-06T09:00' },
    { time: '2026-04-06T10:00' },
    { time: '2026-04-06T11:00' },
    { time: '2026-04-06T12:00' },
    { time: '2026-04-06T13:00' },
    { time: '2026-04-06T14:00' },
    { time: '2026-04-06T15:00' },
    { time: '2026-04-06T16:00' },
    { time: '2026-04-06T17:00' },
    { time: '2026-04-06T18:00' },
    { time: '2026-04-06T19:00' },
    { time: '2026-04-06T20:00' },
  ];

  const selected = selectForecastRows(
    rows,
    'America/Chicago',
    'three_hour',
    new Date('2026-04-06T14:15:00-05:00'),
  );

  assert.deepEqual(
    selected.map((row) => row.time),
    ['2026-04-06T14:00', '2026-04-06T17:00', '2026-04-06T20:00'],
  );
});

test('selectForecastRows keeps every hour for hourly view from now forward', () => {
  const rows = [
    { time: '2026-04-06T13:00' },
    { time: '2026-04-06T14:00' },
    { time: '2026-04-06T15:00' },
    { time: '2026-04-06T16:00' },
  ];

  const selected = selectForecastRows(
    rows,
    'America/Chicago',
    'hourly',
    new Date('2026-04-06T14:15:00-05:00'),
  );

  assert.deepEqual(
    selected.map((row) => row.time),
    ['2026-04-06T14:00', '2026-04-06T15:00', '2026-04-06T16:00'],
  );
});

test('resolveForecastPeriod chooses upcoming weekend dates', () => {
  const dailyRows = [
    { time: '2026-04-06' },
    { time: '2026-04-07' },
    { time: '2026-04-08' },
    { time: '2026-04-09' },
    { time: '2026-04-10' },
    { time: '2026-04-11' },
    { time: '2026-04-12' },
    { time: '2026-04-13' },
  ];

  const selection = resolveForecastPeriod(
    'weekend',
    dailyRows,
    'America/Chicago',
    new Date('2026-04-06T14:15:00-05:00'),
  );

  assert.deepEqual(selection, {
    mode: 'daily',
    selectedDates: ['2026-04-11', '2026-04-12'],
    label: 'Upcoming Weekend',
  });
});

test('resolveForecastPeriod chooses the next requested weekday', () => {
  const dailyRows = [
    { time: '2026-04-06' },
    { time: '2026-04-07' },
    { time: '2026-04-08' },
    { time: '2026-04-09' },
  ];

  const selection = resolveForecastPeriod(
    'wednesday',
    dailyRows,
    'America/Chicago',
    new Date('2026-04-06T14:15:00-05:00'),
  );

  assert.deepEqual(selection, {
    mode: 'hourly',
    selectedDates: ['2026-04-08'],
    label: 'Wednesday',
  });
});

test('evaluateRideAlert flags rough ride windows when rain or gusts are high', () => {
  const result = evaluateRideAlert([
    {
      time: '2026-04-11T07:00',
      precipitationProbability: 65,
      windSpeed: 14,
      windGust: 31,
      weatherCode: 63,
    },
  ]);

  assert.equal(result.shouldAlert, true);
  assert.equal(result.level, 'bad');
  assert.match(result.summary, /ride window looks rough/i);
});

test('evaluateRideAlert stays quiet for manageable conditions', () => {
  const result = evaluateRideAlert([
    {
      time: '2026-04-11T07:00',
      precipitationProbability: 15,
      windSpeed: 10,
      windGust: 16,
      weatherCode: 1,
    },
  ], [
    {
      precipitationProbability: 15,
      windSpeed: 10,
      windGust: 16,
    },
  ]);

  assert.equal(result.shouldAlert, false);
  assert.equal(result.level, 'good');
  assert.match(result.summary, /ride window looks manageable/i);
});

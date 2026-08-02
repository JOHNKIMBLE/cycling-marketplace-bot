import { logError, logInfo } from './logger.js';

function formatDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getWeekdayName(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(date).toLowerCase();
}

function getLocalTimeParts(date, timeZone) {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(formatted.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(formatted.find((part) => part.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

function parseTimeLocal(timeLocal) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeLocal || '');
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

async function sendEmbedsToChannel(channel, embeds, content = null) {
  if (embeds.length === 0) {
    return;
  }

  await channel.send({
    content: content || undefined,
    embeds: [embeds[0]],
  });

  for (const embed of embeds.slice(1)) {
    await channel.send({ embeds: [embed] });
  }
}

export class WeatherScheduler {
  constructor({ client, store, weatherService, pollIntervalMs = 60_000 }) {
    this.client = client;
    this.store = store;
    this.weatherService = weatherService;
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
        logError('Weather scheduler tick failed', {
          component: 'weatherScheduler',
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
      const configs = this.store.getWeatherGuildConfigs();
      const now = new Date();

      for (const config of configs) {
        await this.runGuildWeatherAlert(config.guildId, { dueOnly: true, now });
      }
    } finally {
      this.isRunning = false;
    }
  }

  async runGuildWeatherAlert(guildId, { dueOnly = false, now = new Date() } = {}) {
    const config = this.store.getWeatherGuildConfig(guildId);
    if (!config?.beginningLabel || !config.weatherChannelId || !config.weatherTimeLocal || !Array.isArray(config.weatherDays) || config.weatherDays.length === 0) {
      return false;
    }

    const channel = await this.client.channels.fetch(config.weatherChannelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
      return false;
    }

    const timeZone = config.beginningTimezone || 'America/Chicago';
    const targetTime = parseTimeLocal(config.weatherTimeLocal);
    if (!targetTime) {
      return false;
    }

    const localWeekday = getWeekdayName(now, timeZone);
    const localDateKey = formatDateKey(now, timeZone);
    const localTime = getLocalTimeParts(now, timeZone);
    const alertKey = `${localDateKey}:${config.weatherTimeLocal}`;

    if (dueOnly) {
      if (!config.weatherDays.includes(localWeekday)) {
        return false;
      }

      if (config.lastWeatherAlertKey === alertKey) {
        return false;
      }

      if (localTime.hour !== targetTime.hour || localTime.minute !== targetTime.minute) {
        return false;
      }
    }

    const resolvedLocation = this.weatherService.buildStoredLocationProfile(config, 'beginning');
    if (!resolvedLocation) {
      return false;
    }

    const forecast = await this.weatherService.getRideForecast({
      resolvedLocation,
      locationQuery: config.beginningQuery || config.beginningLabel,
      view: config.weatherView || 'three_hour',
      period: localWeekday,
    });
    const alertMode = config.weatherAlertMode || 'bad_only';
    const rideAlert = forecast.rideAlert;

    if (alertMode === 'bad_only' && !rideAlert?.shouldAlert) {
      return false;
    }

    const embeds = this.weatherService.buildRideWeatherEmbeds(forecast);
    const intro = alertMode === 'bad_only'
      ? `Ride alert for **${config.guildName || guildId}** at **${config.beginningLabel}**: ${rideAlert?.summary || 'weather looks rough.'}`
      : `Scheduled ride weather update for **${config.guildName || guildId}** at **${config.beginningLabel}**: ${rideAlert?.summary || 'forecast loaded.'}`;
    await sendEmbedsToChannel(channel, embeds, intro);

    logInfo('Sent scheduled weather forecast', {
      component: 'weatherScheduler',
      guildId,
      channelId: config.weatherChannelId,
      weekday: localWeekday,
      locationLabel: config.beginningLabel,
      alertMode,
      rideAlertLevel: rideAlert?.level || 'unknown',
    });

    await this.store.upsertWeatherGuildConfig({
      guildId,
      lastWeatherAlertKey: alertKey,
    });

    return true;
  }
}

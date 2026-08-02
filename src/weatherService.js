import { EmbedBuilder } from 'discord.js';

const GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast';
const NOMINATIM_SEARCH_API_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_LOCATION = 'Chicago, IL';
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const US_STATE_ABBREVIATIONS = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new hampshire',
  NJ: 'new jersey',
  NM: 'new mexico',
  NY: 'new york',
  NC: 'north carolina',
  ND: 'north dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode island',
  SC: 'south carolina',
  SD: 'south dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
  DC: 'district of columbia',
};

const WEATHER_CODE_LABELS = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunder with hail',
  99: 'Severe thunderstorm',
};

const WEATHER_ALERT_THRESHOLDS = {
  rainProbability: 40,
  windSpeed: 18,
  windGust: 28,
  severeCodes: new Set([65, 67, 82, 95, 96, 99]),
};

function formatLocationLabel(location) {
  return [location.name, location.admin1, location.country_code].filter(Boolean).join(', ');
}

function buildMapsUrl(queryOrLabel) {
  if (!queryOrLabel) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryOrLabel)}`;
}

function buildDirectionsUrl(originQueryOrLabel, destinationQueryOrLabel) {
  if (!originQueryOrLabel || !destinationQueryOrLabel) {
    return null;
  }

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originQueryOrLabel)}&destination=${encodeURIComponent(destinationQueryOrLabel)}`;
}

function pickWorstRow(rows, scorer) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows.reduce((worst, row) => {
    if (!worst) {
      return row;
    }

    return scorer(row) > scorer(worst) ? row : worst;
  }, null);
}

function normalizeLocationToken(value) {
  return value.trim().toLowerCase();
}

function expandRegionToken(token) {
  const normalized = normalizeLocationToken(token);
  return US_STATE_ABBREVIATIONS[normalized.toUpperCase()] ?? normalized;
}

function formatDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getCurrentHour(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date));
}

function parseHour(isoString) {
  return Number(isoString.slice(11, 13));
}

function formatClockLabel(isoString) {
  const [hourString, minuteString = '00'] = isoString.slice(11).split(':');
  const hour = Number(hourString);
  const minute = Number(minuteString);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;

  if (minute === 0) {
    return `${normalizedHour} ${suffix}`;
  }

  return `${normalizedHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function getUnits(countryCode) {
  const useImperial = ['US', 'LR', 'MM'].includes(countryCode?.toUpperCase() ?? '');

  return useImperial
    ? {
        temperatureUnit: 'fahrenheit',
        temperatureSuffix: 'F',
        windSpeedUnit: 'mph',
        windSuffix: 'mph',
        precipitationUnit: 'inch',
        precipitationSuffix: 'in',
      }
    : {
        temperatureUnit: 'celsius',
        temperatureSuffix: 'C',
        windSpeedUnit: 'kmh',
        windSuffix: 'km/h',
        precipitationUnit: 'mm',
        precipitationSuffix: 'mm',
      };
}

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') {
      continue;
    }

    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  return url;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KimbleBot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`weather provider returned ${response.status}`);
  }

  return response.json();
}

function formatNominatimLabel(candidate) {
  const address = candidate.address ?? {};
  return [
    candidate.name ?? candidate.display_name?.split(',')[0],
    address.suburb || address.neighbourhood || address.city_district || address.city || address.town || address.village,
    address.state,
    address.country_code?.toUpperCase(),
  ].filter(Boolean).join(', ');
}

function buildCompactAddressLabel(addressResult, fallbackQuery) {
  const address = addressResult?.address ?? {};
  const name = addressResult?.name ?? addressResult?.display_name?.split(',')[0] ?? null;
  const streetNumber = address.house_number ?? null;
  const streetName = address.road ?? address.pedestrian ?? address.footway ?? null;
  const streetLine = [streetNumber, streetName].filter(Boolean).join(' ').trim();
  const city = address.city || address.town || address.village || address.hamlet || address.municipality || null;
  const state = address.state ?? null;
  const postcode = address.postcode ?? null;
  const country = address.country ?? address.country_code?.toUpperCase() ?? null;

  const parts = [
    name,
    streetLine || null,
    city,
    [state, postcode].filter(Boolean).join(' ').trim() || null,
    country,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : (addressResult?.display_name ?? fallbackQuery);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeIntersectionLabel(value) {
  return value
    .replace(/\bavenue\b/gi, 'Ave')
    .replace(/\bstreet\b/gi, 'St')
    .replace(/\broad\b/gi, 'Rd')
    .replace(/\bboulevard\b/gi, 'Blvd')
    .replace(/\bnorth\b/gi, 'N')
    .replace(/\bsouth\b/gi, 'S')
    .replace(/\beast\b/gi, 'E')
    .replace(/\bwest\b/gi, 'W')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocationQueryVariants(locationQuery) {
  const trimmed = locationQuery.trim();
  const variants = [trimmed];

  const nearMatch = /\bnear\b\s+(.+)$/i.exec(trimmed);
  if (nearMatch) {
    variants.push(nearMatch[1].trim());
  }

  const atMatch = /\bat\b\s+(.+)$/i.exec(trimmed);
  if (atMatch) {
    variants.push(atMatch[1].trim());
  }

  const onMatch = /\bon\b\s+(.+)$/i.exec(trimmed);
  if (onMatch) {
    variants.push(onMatch[1].trim());
  }

  const strippedBusiness = trimmed.replace(/^[^,]+?\b(?:near|at|on)\b\s+/i, '').trim();
  if (strippedBusiness && strippedBusiness !== trimmed) {
    variants.push(strippedBusiness);
  }

  const andPattern = /(.+?)\s+\band\b\s+(.+?)(,\s*.+)?$/i;
  const andMatch = andPattern.exec(strippedBusiness || trimmed);
  if (andMatch) {
    const left = normalizeIntersectionLabel(andMatch[1]);
    const right = normalizeIntersectionLabel(andMatch[2]);
    const suffix = andMatch[3]?.trim() ?? '';
    variants.push(`${left} & ${right}${suffix ? ` ${suffix}` : ''}`.trim());
    variants.push(`${right} & ${left}${suffix ? ` ${suffix}` : ''}`.trim());
  }

  return uniqueValues(variants);
}

function buildHourlyRows(hourly) {
  return hourly.time.map((time, index) => ({
    time,
    temperature: hourly.temperature_2m[index],
    apparentTemperature: hourly.apparent_temperature[index],
    precipitationProbability: hourly.precipitation_probability[index],
    precipitation: hourly.precipitation[index],
    windSpeed: hourly.wind_speed_10m[index],
    windGust: hourly.wind_gusts_10m[index],
    windDirection: hourly.wind_direction_10m[index],
    humidity: hourly.relative_humidity_2m[index],
    weatherCode: hourly.weather_code[index],
  }));
}

function buildDailyRows(daily) {
  return daily.time.map((time, index) => ({
    time,
    high: daily.temperature_2m_max[index],
    low: daily.temperature_2m_min[index],
    precipitationProbability: daily.precipitation_probability_max[index],
    windSpeed: daily.wind_speed_10m_max[index],
    windGust: daily.wind_gusts_10m_max[index],
    sunrise: daily.sunrise[index],
    sunset: daily.sunset[index],
    weatherCode: daily.weather_code[index],
  }));
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function formatDecimal(value) {
  return Number.isFinite(value) ? value.toFixed(2) : null;
}

function displayValue(value, suffix = '') {
  return value == null ? '?' : `${value}${suffix}`;
}

function getWeekdayIndex(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatDayLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function selectRowsForDate(rows, dateKey, view, timeZone, now = new Date()) {
  const currentDayKey = formatDateKey(now, timeZone);
  const currentHour = getCurrentHour(now, timeZone);
  const dateRows = rows.filter((row) => row.time.startsWith(dateKey));
  const remainingRows = dateKey === currentDayKey
    ? dateRows.filter((row) => parseHour(row.time) >= currentHour)
    : dateRows;
  const workingRows = remainingRows.length > 0 ? remainingRows : dateRows;
  const stride = view === 'hourly' ? 1 : 3;

  return workingRows.filter((_, index) => index === 0 || index % stride === 0);
}

export function selectForecastRows(rows, timeZone, view, now = new Date()) {
  return selectRowsForDate(rows, formatDateKey(now, timeZone), view, timeZone, now);
}

export function directionToCardinal(degrees) {
  if (!Number.isFinite(degrees)) {
    return '?';
  }

  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

export function directionToArrow(degrees) {
  if (!Number.isFinite(degrees)) {
    return '?';
  }

  const arrows = ['^', '/', '>', '\\', 'v', '/', '<', '\\'];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % arrows.length;
  return arrows[index];
}

export function describeWeatherCode(code) {
  return WEATHER_CODE_LABELS[code] ?? 'Conditions unavailable';
}

function getWeatherEmoji(code) {
  if ([0, 1].includes(code)) {
    return '\u2600\uFE0F';
  }

  if (code === 2) {
    return '\u26C5';
  }

  if ([3, 45, 48].includes(code)) {
    return '\u2601\uFE0F';
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return '\u{1F327}\uFE0F';
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return '\u{1F328}\uFE0F';
  }

  if ([95, 96, 99].includes(code)) {
    return '\u26C8\uFE0F';
  }

  return '\u{1F324}\uFE0F';
}

function getTwemojiUrl(emoji) {
  const codepoints = [...emoji]
    .map((char) => char.codePointAt(0).toString(16))
    .join('-');
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints}.png`;
}

function getWeatherColor(code) {
  if ([0, 1].includes(code)) {
    return 0xf59e0b;
  }

  if (code === 2) {
    return 0xfbbf24;
  }

  if ([3, 45, 48].includes(code)) {
    return 0x94a3b8;
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 0x38bdf8;
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 0xbfdbfe;
  }

  if ([95, 96, 99].includes(code)) {
    return 0x6366f1;
  }

  return 0x60a5fa;
}

export function resolveForecastPeriod(period, dailyRows, timeZone, now = new Date()) {
  const todayKey = formatDateKey(now, timeZone);
  const availableDates = dailyRows.map((row) => row.time);

  if (!availableDates.includes(todayKey)) {
    throw new Error('No daily weather data was available for today.');
  }

  if (period === 'today') {
    return { mode: 'hourly', selectedDates: [todayKey], label: 'Today' };
  }

  if (period === 'tomorrow') {
    const todayIndex = availableDates.indexOf(todayKey);
    const tomorrow = availableDates[todayIndex + 1];
    if (!tomorrow) {
      throw new Error('Tomorrow is outside the available forecast window.');
    }

    return { mode: 'hourly', selectedDates: [tomorrow], label: 'Tomorrow' };
  }

  if (period === 'weekend') {
    const saturday = availableDates.find((dateKey) => dateKey >= todayKey && getWeekdayIndex(dateKey) === 6);
    if (!saturday) {
      throw new Error('No weekend forecast was available in the current forecast window.');
    }

    const sunday = availableDates.find((dateKey) => dateKey > saturday && getWeekdayIndex(dateKey) === 0);
    return {
      mode: 'daily',
      selectedDates: sunday ? [saturday, sunday] : [saturday],
      label: 'Upcoming Weekend',
    };
  }

  if (period === 'ten_day') {
    return {
      mode: 'daily',
      selectedDates: availableDates.slice(0, 10),
      label: '10-Day Outlook',
    };
  }

  const targetWeekday = WEEKDAY_NAMES.findIndex((day) => day.toLowerCase() === period);
  if (targetWeekday !== -1) {
    const match = availableDates.find((dateKey) => dateKey >= todayKey && getWeekdayIndex(dateKey) === targetWeekday);
    if (!match) {
      throw new Error(`No forecast was available for ${WEEKDAY_NAMES[targetWeekday]}.`);
    }

    return {
      mode: 'hourly',
      selectedDates: [match],
      label: WEEKDAY_NAMES[targetWeekday],
    };
  }

  throw new Error(`Unknown weather period: ${period}`);
}

export function evaluateRideAlert(rows, dailyRows = []) {
  const rainyRow = pickWorstRow(rows, (row) => Number(row?.precipitationProbability) || 0);
  const windyRow = pickWorstRow(
    rows,
    (row) => Math.max(Number(row?.windGust) || 0, Number(row?.windSpeed) || 0),
  );
  const severeRow = rows.find((row) => WEATHER_ALERT_THRESHOLDS.severeCodes.has(row?.weatherCode));
  const dailyWorst = pickWorstRow(
    dailyRows,
    (row) => Math.max(
      Number(row?.precipitationProbability) || 0,
      Number(row?.windGust) || 0,
      Number(row?.windSpeed) || 0,
    ),
  );
  const reasons = [];

  if (severeRow) {
    reasons.push(`${describeWeatherCode(severeRow.weatherCode)} around ${formatClockLabel(severeRow.time)}`);
  }

  if ((Number(rainyRow?.precipitationProbability) || 0) >= WEATHER_ALERT_THRESHOLDS.rainProbability) {
    reasons.push(`rain chances up to ${Math.round(rainyRow.precipitationProbability)}% around ${formatClockLabel(rainyRow.time)}`);
  }

  if ((Number(windyRow?.windGust) || 0) >= WEATHER_ALERT_THRESHOLDS.windGust) {
    reasons.push(`gusts up to ${Math.round(windyRow.windGust)} mph around ${formatClockLabel(windyRow.time)}`);
  } else if ((Number(windyRow?.windSpeed) || 0) >= WEATHER_ALERT_THRESHOLDS.windSpeed) {
    reasons.push(`winds up to ${Math.round(windyRow.windSpeed)} mph around ${formatClockLabel(windyRow.time)}`);
  }

  if (reasons.length > 0) {
    return {
      level: 'bad',
      shouldAlert: true,
      summary: `Ride window looks rough: ${reasons.join('; ')}.`,
    };
  }

  if (dailyWorst) {
    return {
      level: 'good',
      shouldAlert: false,
      summary: `Ride window looks manageable: rain tops out near ${Math.round(Number(dailyWorst.precipitationProbability) || 0)}% and gusts stay around ${Math.round(Number(dailyWorst.windGust) || 0)} mph.`,
    };
  }

  return {
    level: 'good',
    shouldAlert: false,
    summary: 'Ride window looks manageable based on the available forecast.',
  };
}

function buildCurrentField(current, units) {
  return [
    `${displayValue(formatNumber(current.temperature_2m), units.temperatureSuffix)}, feels like ${displayValue(formatNumber(current.apparent_temperature), units.temperatureSuffix)}`,
    describeWeatherCode(current.weather_code),
    `Wind ${displayValue(formatNumber(current.wind_speed_10m), ` ${units.windSuffix}`)} ${directionToArrow(current.wind_direction_10m)} ${directionToCardinal(current.wind_direction_10m)}`,
  ].join('\n');
}

function buildWeatherVisual(code) {
  const emoji = getWeatherEmoji(code);
  return {
    emoji,
    imageUrl: getTwemojiUrl(emoji),
    label: describeWeatherCode(code),
  };
}

export class WeatherService {
  buildMapsUrl(queryOrLabel) {
    return buildMapsUrl(queryOrLabel);
  }

  buildDirectionsUrl(originQueryOrLabel, destinationQueryOrLabel) {
    return buildDirectionsUrl(originQueryOrLabel, destinationQueryOrLabel);
  }

  async resolveTimezone(latitude, longitude) {
    const url = buildUrl(FORECAST_API_URL, {
      latitude,
      longitude,
      timezone: 'auto',
      current: ['temperature_2m'],
      forecast_days: 1,
    });

    const payload = await fetchJson(url);
    return payload.timezone || null;
  }

  buildStoredLocationProfile(locationConfig, kind = 'beginning') {
    const prefix = kind === 'end' ? 'end' : 'beginning';
    const label = locationConfig?.[`${prefix}Label`] ?? (prefix === 'beginning' ? locationConfig?.locationLabel : null);
    const latitude = locationConfig?.[`${prefix}Latitude`] ?? (prefix === 'beginning' ? locationConfig?.latitude : null);
    const longitude = locationConfig?.[`${prefix}Longitude`] ?? (prefix === 'beginning' ? locationConfig?.longitude : null);
    const admin1 = locationConfig?.[`${prefix}Admin1`] ?? (prefix === 'beginning' ? locationConfig?.admin1 : null);
    const countryCode = locationConfig?.[`${prefix}CountryCode`] ?? (prefix === 'beginning' ? locationConfig?.countryCode : null);
    const timezone = locationConfig?.[`${prefix}Timezone`] ?? (prefix === 'beginning' ? locationConfig?.timezone : null);

    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      name: label.split(',')[0] || label,
      admin1,
      country_code: countryCode,
      latitude,
      longitude,
      timezone: timezone || 'America/Chicago',
    };
  }

  async searchLocationCandidates(locationQuery) {
    const url = buildUrl(GEOCODING_API_URL, {
      name: locationQuery,
      count: 10,
      language: 'en',
      format: 'json',
    });

    const payload = await fetchJson(url);
    return payload.results ?? [];
  }

  async searchAddressCandidates(locationQuery) {
    const url = buildUrl(NOMINATIM_SEARCH_API_URL, {
      q: locationQuery,
      format: 'jsonv2',
      addressdetails: 1,
      limit: 5,
    });

    const payload = await fetchJson(url);
    return Array.isArray(payload) ? payload : [];
  }

  pickBestLocation(candidates, locationQuery) {
    const segments = locationQuery
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const primaryName = normalizeLocationToken(segments[0] || locationQuery);
    const regionHints = new Set(segments.slice(1).map(expandRegionToken));

    const scoredCandidates = candidates.map((candidate) => {
      let score = 0;
      const candidateName = normalizeLocationToken(candidate.name ?? '');
      const candidateAdmin = normalizeLocationToken(candidate.admin1 ?? '');
      const candidateCountry = normalizeLocationToken(candidate.country ?? '');
      const candidateCountryCode = normalizeLocationToken(candidate.country_code ?? '');

      if (candidateName === primaryName) {
        score += 5;
      } else if (candidateName.startsWith(primaryName)) {
        score += 3;
      }

      if (regionHints.has(candidateAdmin)) {
        score += 3;
      }

      if (regionHints.has(candidateCountry) || regionHints.has(candidateCountryCode)) {
        score += 3;
      }

      score += Math.min(Number(candidate.population) || 0, 1_000_000) / 1_000_000;
      return { candidate, score };
    });

    scoredCandidates.sort((left, right) => right.score - left.score);
    return scoredCandidates[0]?.candidate ?? null;
  }

  async geocodeLocation(locationQuery) {
    const queryVariants = buildLocationQueryVariants(locationQuery);

    for (const candidateQuery of queryVariants) {
      const directCandidates = await this.searchLocationCandidates(candidateQuery);
      let result = this.pickBestLocation(directCandidates, candidateQuery);

      if (!result && candidateQuery.includes(',')) {
        const [primarySegment] = candidateQuery.split(',');
        const fallbackCandidates = await this.searchLocationCandidates(primarySegment.trim());
        result = this.pickBestLocation(fallbackCandidates, candidateQuery);
      }

      if (result) {
        return result;
      }

      const addressCandidates = await this.searchAddressCandidates(candidateQuery);
      const addressResult = addressCandidates[0] ?? null;

      if (addressResult) {
        const latitude = Number(addressResult.lat);
        const longitude = Number(addressResult.lon);
        const timezone = await this.resolveTimezone(latitude, longitude).catch(() => null);
        const compactLabel = buildCompactAddressLabel(addressResult, locationQuery);

        return {
          name: addressResult.name ?? addressResult.display_name?.split(',')[0] ?? locationQuery,
          admin1: addressResult.address?.state ?? null,
          country_code: addressResult.address?.country_code?.toUpperCase() ?? null,
          country: addressResult.address?.country ?? null,
          latitude,
          longitude,
          timezone,
          display_name: compactLabel,
          full_display_name: addressResult.display_name ?? null,
        };
      }
    }

    throw new Error(`I could not find a weather location for "${locationQuery}".`);
  }

  async resolveLocationConfig({ guildName, beginningQuery, endQuery = null, configuredByUserId }) {
    const beginningLocation = await this.geocodeLocation(beginningQuery);
    const endLocation = endQuery ? await this.geocodeLocation(endQuery) : null;

    return {
      guildName,
      beginningQuery,
      beginningLabel: beginningLocation.display_name || formatLocationLabel(beginningLocation),
      beginningLatitude: beginningLocation.latitude,
      beginningLongitude: beginningLocation.longitude,
      beginningAdmin1: beginningLocation.admin1 ?? null,
      beginningCountryCode: beginningLocation.country_code ?? null,
      beginningTimezone: beginningLocation.timezone || 'America/Chicago',
      beginningMapsUrl: buildMapsUrl(beginningLocation.display_name || formatLocationLabel(beginningLocation) || beginningQuery),
      endQuery,
      endLabel: endLocation ? (endLocation.display_name || formatLocationLabel(endLocation)) : null,
      endLatitude: endLocation?.latitude ?? null,
      endLongitude: endLocation?.longitude ?? null,
      endAdmin1: endLocation?.admin1 ?? null,
      endCountryCode: endLocation?.country_code ?? null,
      endTimezone: endLocation?.timezone ?? null,
      endMapsUrl: endLocation ? buildMapsUrl(endLocation.display_name || formatLocationLabel(endLocation) || endQuery) : null,
      directionsUrl: endLocation
        ? buildDirectionsUrl(
            beginningLocation.display_name || formatLocationLabel(beginningLocation) || beginningQuery,
            endLocation.display_name || formatLocationLabel(endLocation) || endQuery,
          )
        : null,
      configuredByUserId,
      configuredAt: new Date().toISOString(),
    };
  }

  async getRideForecast({
    locationQuery = DEFAULT_LOCATION,
    view = 'three_hour',
    period = 'today',
    resolvedLocation = null,
  } = {}) {
    const location = resolvedLocation ?? await this.geocodeLocation(locationQuery);
    const units = getUnits(location.country_code);
    const timeZone = location.timezone || 'auto';
    const forecastUrl = buildUrl(FORECAST_API_URL, {
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: timeZone,
      forecast_days: 10,
      temperature_unit: units.temperatureUnit,
      wind_speed_unit: units.windSpeedUnit,
      precipitation_unit: units.precipitationUnit,
      current: [
        'temperature_2m',
        'apparent_temperature',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
      ],
      hourly: [
        'temperature_2m',
        'apparent_temperature',
        'precipitation_probability',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_gusts_10m',
        'wind_direction_10m',
        'relative_humidity_2m',
      ],
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'sunrise',
        'sunset',
      ],
    });

    const forecast = await fetchJson(forecastUrl);
    const hourlyRows = buildHourlyRows(forecast.hourly);
    const dailyRows = buildDailyRows(forecast.daily);
    const selectedPeriod = resolveForecastPeriod(period, dailyRows, timeZone);
    const selectedHourlyRows = selectedPeriod.mode === 'hourly'
      ? selectRowsForDate(hourlyRows, selectedPeriod.selectedDates[0], view, timeZone)
      : [];
    const selectedDailyRows = dailyRows.filter((row) => selectedPeriod.selectedDates.includes(row.time));

    if (selectedPeriod.mode === 'hourly' && selectedHourlyRows.length === 0) {
      throw new Error(`No hourly weather data was available for ${selectedPeriod.label.toLowerCase()}.`);
    }

    return {
      location,
      units,
      timeZone,
      forecast,
      rows: selectedHourlyRows,
      dailyRows: selectedDailyRows,
      view,
      period: selectedPeriod,
      rideAlert: evaluateRideAlert(selectedHourlyRows, selectedDailyRows),
    };
  }

  buildLocationEmbeds(locationConfig, { target = 'both' } = {}) {
    const beginning = this.buildStoredLocationProfile(locationConfig, 'beginning');
    const end = this.buildStoredLocationProfile(locationConfig, 'end');
    const resolvedBeginning = locationConfig.beginningLabel || locationConfig.beginningQuery || 'Unknown beginning location';
    const resolvedEnd = locationConfig.endLabel || locationConfig.endQuery || null;
    const showBeginning = target === 'both' || target === 'beginning';
    const showEnd = target === 'both' || target === 'end';

    if (showBeginning && !beginning) {
      throw new Error('No beginning meetup location is configured for this server yet.');
    }

    if (showEnd && !end) {
      throw new Error('No end meetup location is configured for this server yet.');
    }

    if (!showBeginning && !showEnd) {
      throw new Error('No meetup location target was selected.');
    }

    const titleSuffix = target === 'beginning'
      ? 'Beginning'
      : target === 'end'
        ? 'End'
        : 'Locations';

    const embed = new EmbedBuilder()
      .setColor(0x16a34a)
      .setTitle(`Ride Meetup ${titleSuffix}: ${locationConfig.guildName || 'Server'}`)
      .setURL(
        target === 'end'
          ? (locationConfig.endMapsUrl || null)
          : (locationConfig.beginningMapsUrl || locationConfig.endMapsUrl || null),
      )
      .setDescription([
        ...(showBeginning ? ['**Resolved Beginning Address**', `> ${resolvedBeginning}`] : []),
        ...(showBeginning && showEnd && resolvedEnd ? [''] : []),
        ...(showEnd && resolvedEnd ? ['**Resolved End Address**', `> ${resolvedEnd}`] : []),
        '',
        'Google Maps links are posted below for quick opening and preview.',
      ].filter(Boolean).join('\n'))
      .addFields(
        ...(showBeginning ? [{
          name: 'Beginning',
          value: [
            locationConfig.beginningQuery ? `Input: ${locationConfig.beginningQuery}` : null,
            `Address: ${resolvedBeginning}`,
            `Timezone: ${locationConfig.beginningTimezone || 'local'}`,
          ].filter(Boolean).join('\n'),
          inline: false,
        }] : []),
        ...(showEnd ? [{
          name: 'End',
          value: [
            locationConfig.endQuery ? `Input: ${locationConfig.endQuery}` : null,
            `Address: ${resolvedEnd}`,
            `Timezone: ${locationConfig.endTimezone || locationConfig.beginningTimezone || 'local'}`,
          ].filter(Boolean).join('\n'),
          inline: false,
        }] : []),
        {
          name: 'Weather Automation',
          value: locationConfig.weatherChannelId
            ? [
                `Channel: <#${locationConfig.weatherChannelId}>`,
                `Days: ${locationConfig.weatherDays.length > 0 ? locationConfig.weatherDays.map((day) => day[0].toUpperCase() + day.slice(1)).join(', ') : 'None'}`,
                `Time: ${locationConfig.weatherTimeLocal || 'Not set'} (${locationConfig.beginningTimezone || 'local'})`,
                `View: ${locationConfig.weatherView || 'three_hour'}`,
                `Mode: ${(locationConfig.weatherAlertMode || 'bad_only') === 'bad_only' ? 'Only when weather looks bad' : 'Always post'}`,
              ].join('\n')
            : 'Not scheduled',
          inline: false,
        },
      )
      .setFooter({ text: 'Ride meetup location settings' })
      .setTimestamp(new Date(locationConfig.configuredAt || Date.now()));

    return [embed];
  }

  buildRideWeatherEmbeds({ location, units, forecast, rows, dailyRows, view, period, rideAlert }) {
    const primaryWeatherCode = period.mode === 'daily'
      ? dailyRows[0]?.weatherCode
      : rows[0]?.weatherCode ?? forecast.current.weather_code;
    const primaryVisual = buildWeatherVisual(primaryWeatherCode);
    const summaryEmbed = new EmbedBuilder()
      .setColor(getWeatherColor(primaryWeatherCode))
      .setTitle(`${primaryVisual.emoji} Ride Weather: ${formatLocationLabel(location)}`)
      .setThumbnail(primaryVisual.imageUrl)
      .setFooter({ text: 'Weather by Open-Meteo | card layout' })
      .setTimestamp(new Date());

    if (period.mode === 'daily') {
      summaryEmbed
        .setDescription([
          `${period.label} for ride planning.`,
          `${dailyRows.length} daily card${dailyRows.length === 1 ? '' : 's'} below.`,
        ].join('\n'));

      if (rideAlert?.summary) {
        summaryEmbed.addFields({
          name: 'Ride Call',
          value: rideAlert.summary,
          inline: false,
        });
      }

      const dailyEmbeds = dailyRows.map((day) => {
        const visual = buildWeatherVisual(day.weatherCode);

        const embed = new EmbedBuilder()
          .setColor(getWeatherColor(day.weatherCode))
          .setTitle(`${visual.emoji} ${formatDayLabel(day.time)} | Daily Card`)
          .setDescription(visual.label)
          .addFields(
            {
              name: 'Temperature',
              value: `High ${displayValue(formatNumber(day.high), units.temperatureSuffix)}\nLow ${displayValue(formatNumber(day.low), units.temperatureSuffix)}`,
              inline: true,
            },
            {
              name: 'Wind',
              value: `${displayValue(formatNumber(day.windSpeed), ` ${units.windSuffix}`)}\nGusts ${displayValue(formatNumber(day.windGust), ` ${units.windSuffix}`)}`,
              inline: true,
            },
            {
              name: 'Rain',
              value: `Chance ${displayValue(formatNumber(day.precipitationProbability), '%')}`,
              inline: true,
            },
            {
              name: 'Light Window',
              value: `Sunrise ${formatClockLabel(day.sunrise)}\nSunset ${formatClockLabel(day.sunset)}`,
              inline: false,
            },
          )
          .setFooter({ text: `${period.label} | daily weather card` });

        if (visual.imageUrl) {
          embed.setImage(visual.imageUrl);
        }

        return embed;
      });

      return [summaryEmbed, ...dailyEmbeds];
    }

    const summary = dailyRows[0];
    summaryEmbed
      .setDescription([
        `Showing ${period.label.toLowerCase()} ${view === 'hourly' ? 'hour-by-hour' : 'every 3 hours'} for ride planning.`,
        `${rows.length} forecast card${rows.length === 1 ? '' : 's'} below.`,
      ].join('\n'))
      .addFields(
        {
          name: `${period.label} Summary`,
          value: [
            `High ${displayValue(formatNumber(summary.high), units.temperatureSuffix)} / Low ${displayValue(formatNumber(summary.low), units.temperatureSuffix)}`,
            `Rain chance up to ${displayValue(formatNumber(summary.precipitationProbability), '%')}`,
            `Wind ${displayValue(formatNumber(summary.windSpeed), ` ${units.windSuffix}`)}, gusts ${displayValue(formatNumber(summary.windGust), ` ${units.windSuffix}`)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Light Window',
          value: [
            `Sunrise ${formatClockLabel(summary.sunrise)}`,
            `Sunset ${formatClockLabel(summary.sunset)}`,
            `Timezone ${location.timezone || 'local'}`,
          ].join('\n'),
          inline: true,
        },
      );

    if (rideAlert?.summary) {
      summaryEmbed.addFields({
        name: 'Ride Call',
        value: rideAlert.summary,
        inline: false,
      });
    }

    const forecastEmbeds = rows.map((row) => {
      const visual = buildWeatherVisual(row.weatherCode);
      const windDirection = `${directionToArrow(row.windDirection)} ${directionToCardinal(row.windDirection)}`;

      const embed = new EmbedBuilder()
        .setColor(getWeatherColor(row.weatherCode))
        .setTitle(`${visual.emoji} ${formatClockLabel(row.time)} | Forecast Card`)
        .setDescription(visual.label)
        .addFields(
          {
            name: 'Temperature',
            value: `${displayValue(formatNumber(row.temperature), units.temperatureSuffix)}\nFeels ${displayValue(formatNumber(row.apparentTemperature), units.temperatureSuffix)}`,
            inline: true,
          },
          {
            name: 'Wind',
            value: `${displayValue(formatNumber(row.windSpeed), ` ${units.windSuffix}`)} ${windDirection}\nGusts ${displayValue(formatNumber(row.windGust), ` ${units.windSuffix}`)}`,
            inline: true,
          },
          {
            name: 'Rain',
            value: `${displayValue(formatNumber(row.precipitationProbability), '%')}\n${displayValue(formatDecimal(row.precipitation), ` ${units.precipitationSuffix}`)}`,
            inline: true,
          },
          {
            name: 'Humidity',
            value: displayValue(formatNumber(row.humidity), '%'),
            inline: true,
          },
        )
        .setFooter({ text: `${period.label} | forecast card` });

      if (visual.imageUrl) {
        embed.setImage(visual.imageUrl);
      }

      return embed;
    });

    return [summaryEmbed, ...forecastEmbeds];
  }
}

import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv();

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const appConfig = {
  token: getRequiredEnv('DISCORD_BOT_TOKEN'),
  clientId: getRequiredEnv('DISCORD_CLIENT_ID'),
  networkGuildAllowlist: (process.env.NETWORK_GUILD_ALLOWLIST || process.env.SOURCE_GUILD_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  dataFile: path.resolve(process.cwd(), process.env.DATA_FILE?.trim() || './data/marketplace-state.json'),
  stravaClientId: process.env.STRAVA_CLIENT_ID?.trim() || null,
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET?.trim() || null,
  stravaRedirectUri: process.env.STRAVA_REDIRECT_URI?.trim() || null,
  stravaDefaultClubId: process.env.STRAVA_DEFAULT_CLUB_ID?.trim() || null,
  stravaOAuthPort: Number(process.env.STRAVA_OAUTH_PORT?.trim() || '3049'),
  stravaOAuthHost: process.env.STRAVA_OAUTH_HOST?.trim() || '0.0.0.0',
  stravaOAuthScopes: (process.env.STRAVA_OAUTH_SCOPES?.trim() || 'read,activity:read')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};

import { Client, Events, GatewayIntentBits } from 'discord.js';

import {
  handleCommandInteraction,
  registerCommandsForGuild,
  registerGuildCommands,
} from './commands.js';
import { appConfig } from './config.js';
import { MarketplaceService } from './marketplaceService.js';
import { MarketplaceStore } from './store.js';
import { StravaOAuthServer } from './stravaOAuthServer.js';
import { StravaScheduler } from './stravaScheduler.js';
import { StravaService } from './stravaService.js';
import { WeatherService } from './weatherService.js';
import { WeatherScheduler } from './weatherScheduler.js';
import { logInfo, logWarn } from './logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const store = new MarketplaceStore(appConfig.dataFile);
const marketplaceService = new MarketplaceService({ client, store });
const stravaService = new StravaService({
  clientId: appConfig.stravaClientId,
  clientSecret: appConfig.stravaClientSecret,
  redirectUri: appConfig.stravaRedirectUri,
  oauthScopes: appConfig.stravaOAuthScopes,
  defaultClubId: appConfig.stravaDefaultClubId,
  store,
});
const stravaScheduler = new StravaScheduler({
  client,
  store,
  stravaService,
});
const weatherService = new WeatherService();
const weatherScheduler = new WeatherScheduler({
  client,
  store,
  weatherService,
});
const stravaOAuthServer = new StravaOAuthServer({
  stravaService,
  redirectUri: appConfig.stravaRedirectUri,
  host: appConfig.stravaOAuthHost,
  port: appConfig.stravaOAuthPort,
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  logInfo('Runtime configuration loaded', {
    component: 'startup',
    stravaOAuthScopes: appConfig.stravaOAuthScopes,
    stravaRedirectUri: appConfig.stravaRedirectUri,
    stravaOAuthPort: appConfig.stravaOAuthPort,
  });

  if (!appConfig.stravaOAuthScopes.includes('activity:read')) {
    logWarn('Strava OAuth scopes are missing activity:read', {
      component: 'startup',
      stravaOAuthScopes: appConfig.stravaOAuthScopes,
    });
  }

  try {
    await registerGuildCommands(readyClient);
    console.log(`Registered marketplace commands in ${readyClient.guilds.cache.size} guild(s).`);
  } catch (error) {
    console.error('Unable to register slash commands:', error);
  }

  stravaScheduler.start();
  weatherScheduler.start();
  stravaOAuthServer.start();
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerCommandsForGuild(guild);
    console.log(`Registered marketplace commands in new guild ${guild.name}.`);
  } catch (error) {
    console.error(`Unable to register commands for new guild ${guild.name}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  await handleCommandInteraction(interaction, {
    store,
    marketplaceService,
    networkGuildAllowlist: appConfig.networkGuildAllowlist,
    stravaService,
    stravaScheduler,
    weatherService,
    weatherScheduler,
  });
});

client.on(Events.ThreadCreate, async (thread, newlyCreated) => {
  if (!newlyCreated) {
    return;
  }

  try {
    const result = await marketplaceService.mirrorIfWatched(thread, 'live');
    if (result.status === 'mirrored') {
      console.log(`Mirrored source thread ${thread.id} into ${result.mirroredCount} destination forum(s).`);
    }
  } catch (error) {
    console.error(`Unable to mirror thread ${thread.id}:`, error);
  }
});

client.on(Events.ThreadUpdate, async (_oldThread, newThread) => {
  try {
    const result = await marketplaceService.syncMirrorsForSourceThread(newThread, 'source update');
    if (result.status === 'updated' && result.updatedCount > 0) {
      console.log(`Synced ${result.updatedCount} mirrored thread(s) for source thread ${newThread.id}.`);
    }
  } catch (error) {
    console.error(`Unable to sync thread ${newThread.id}:`, error);
  }
});

client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  try {
    if (!newMessage.channel?.isThread?.()) {
      return;
    }

    if (newMessage.author?.id === client.user.id) {
      return;
    }

    if (newMessage.id !== newMessage.channel.id) {
      return;
    }

    const result = await marketplaceService.syncMirrorsForSourceThread(newMessage.channel, 'starter message update');
    if (result.status === 'updated' && result.updatedCount > 0) {
      console.log(`Synced ${result.updatedCount} mirrored thread(s) after starter message edit for source thread ${newMessage.channel.id}.`);
    }
  } catch (error) {
    console.error('Unable to sync mirrors after source message edit:', error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.inGuild() || message.author?.id === client.user.id || !message.channel?.isThread?.()) {
      return;
    }

    if (message.id === message.channelId) {
      return;
    }

    const toSource = await marketplaceService.relayMirrorCommentToSource(message);
    if (toSource.status === 'relayed') {
      console.log(`Relayed mirror comment ${message.id} back to source thread ${toSource.sourceThreadId}.`);
      return;
    }

    const toMirrors = await marketplaceService.relaySellerReplyToMirrors(message);
    if (toMirrors.status === 'relayed') {
      console.log(`Relayed seller reply ${message.id} into ${toMirrors.relayedCount} mirrored thread(s).`);
    }
  } catch (error) {
    console.error(`Unable to relay marketplace message ${message.id}:`, error);
  }
});

client.on(Events.ThreadDelete, async (thread) => {
  try {
    const result = await marketplaceService.closeMirrorsForDeletedSource(thread);
    if (result.status === 'closed' && result.updatedCount > 0) {
      console.log(`Closed ${result.updatedCount} mirrored thread(s) for deleted source thread ${thread.id}.`);
    }
  } catch (error) {
    console.error(`Unable to close mirrors for deleted thread ${thread.id}:`, error);
  }
});

async function main() {
  const storeLoad = await store.load();
  logInfo('Marketplace store loaded', {
    component: 'startup',
    dataFile: storeLoad.filePath,
    backupFile: storeLoad.backupFilePath,
    loadSource: storeLoad.source,
    sizeBytes: storeLoad.sizeBytes,
    destinationCount: storeLoad.destinationCount,
    watchedForumCount: storeLoad.watchedForumCount,
    mirroredThreadCount: storeLoad.mirroredThreadCount,
    stravaGuildCount: storeLoad.stravaGuildCount,
    stravaConnectionCount: storeLoad.stravaConnectionCount,
    backupSummary: storeLoad.backupSummary,
  });

  if (
    storeLoad.backupSummary?.exists
    && (storeLoad.backupSummary.destinationCount > storeLoad.destinationCount
      || storeLoad.backupSummary.watchedForumCount > storeLoad.watchedForumCount
      || storeLoad.backupSummary.stravaGuildCount > storeLoad.stravaGuildCount)
  ) {
    logWarn('Primary marketplace state is smaller than the backup file', {
      component: 'startup',
      dataFile: storeLoad.filePath,
      backupFile: storeLoad.backupFilePath,
      primaryCounts: {
        destinationCount: storeLoad.destinationCount,
        watchedForumCount: storeLoad.watchedForumCount,
        stravaGuildCount: storeLoad.stravaGuildCount,
        stravaConnectionCount: storeLoad.stravaConnectionCount,
      },
      backupSummary: storeLoad.backupSummary,
    });
  }
  await client.login(appConfig.token);
}

main().catch((error) => {
  console.error('KimbleBot failed to start:', error);
  process.exitCode = 1;
});

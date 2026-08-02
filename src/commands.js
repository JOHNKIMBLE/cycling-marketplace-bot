import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logError } from './logger.js';

const marketplaceCommand = new SlashCommandBuilder()
  .setName('marketplace')
  .setDescription('Configure the shared cycling marketplace sync network.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('setup')
      .setDescription("Set this server's destination forum for mirrored marketplace listings.")
      .addChannelOption((option) =>
        option
          .setName('forum')
          .setDescription('The local forum channel that should receive synced listings.')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('disconnect')
      .setDescription("Remove this server's destination forum from the shared sync network."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('watch')
      .setDescription('Register a local forum channel as a source of marketplace posts.')
      .addChannelOption((option) =>
        option
          .setName('forum')
          .setDescription('The source forum channel to watch.')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('team_name')
          .setDescription("Short label used when mirroring this server's listings elsewhere.")
          .setMaxLength(32),
      )
      .addStringOption((option) =>
        option
          .setName('invite_url')
          .setDescription('Optional invite link buyers can use if they need to join the source server.')
          .setMaxLength(512),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('unwatch')
      .setDescription('Stop mirroring posts from a local source forum.')
      .addChannelOption((option) =>
        option
          .setName('forum')
          .setDescription('The source forum channel to remove.')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('list')
      .setDescription("Show this server's sync configuration and the overall network size."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('network')
      .setDescription('Show every connected destination server and watched source forum.'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('backfill')
      .setDescription('Import recent listings from all watched source forums into all destinations.')
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('How many recent threads to scan per watched forum.')
          .setMinValue(1)
          .setMaxValue(25),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('diagnose')
      .setDescription('Check watched and destination forum access for this server.'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('diagnose_network')
      .setDescription('Check watched and destination forum access across the whole connected network.'),
  );

const stravaCommand = new SlashCommandBuilder()
  .setName('strava')
  .setDescription('Per-server Strava utilities and digests.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('setup')
      .setDescription("Configure this server's Strava club and digest channels.")
      .addStringOption((option) =>
        option
          .setName('club_id')
          .setDescription('Default Strava club ID for this server.')
          .setRequired(true),
      )
      .addChannelOption((option) =>
        option
          .setName('leaderboard_channel')
          .setDescription('Optional channel for scheduled leaderboard digests.')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('leaderboard_interval_minutes')
          .setDescription('How often to post the leaderboard digest.')
          .setMinValue(15)
          .setMaxValue(10080)
          .setRequired(false),
      )
      .addChannelOption((option) =>
        option
          .setName('recent_activity_channel')
          .setDescription('Optional channel for scheduled recent-activity digests.')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('recent_activity_interval_minutes')
          .setDescription('How often to post recent activity digests.')
          .setMinValue(15)
          .setMaxValue(10080)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('connect')
      .setDescription("Generate the Strava OAuth link for this server's admin connection."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('disconnect')
      .setDescription("Disconnect this server's Strava OAuth token."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setDescription("Show this server's Strava club, digest, and OAuth status."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('clear')
      .setDescription("Remove this server's Strava club and digest config."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('club')
      .setDescription('Show basic information about a Strava club.')
      .addStringOption((option) =>
        option
          .setName('club_id')
          .setDescription('The Strava club ID. Uses this server config if omitted.')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('leaderboard')
      .setDescription('Show rankings from the Strava club activity feed.')
      .addStringOption((option) =>
        option
          .setName('club_id')
          .setDescription('The Strava club ID. Uses this server config if omitted.')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('week_offset')
          .setDescription('0 for this week, 1 for last week.')
          .setMinValue(0)
          .setMaxValue(8)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('recent')
      .setDescription('Show recent activities for a Strava club.')
      .addStringOption((option) =>
        option
          .setName('club_id')
          .setDescription('The Strava club ID. Uses this server config if omitted.')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('How many recent activities to show.')
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('run_digest')
      .setDescription('Send a digest to the configured channel right now.')
      .addStringOption((option) =>
        option
          .setName('kind')
          .setDescription('Which digest to send.')
          .addChoices(
            { name: 'leaderboard', value: 'leaderboard' },
            { name: 'recent_activity', value: 'recent_activity' },
          )
          .setRequired(true),
      ),
  );

const weatherCommand = new SlashCommandBuilder()
  .setName('weather')
  .setDescription('Show forecasts and automate ride weather posts.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('forecast')
      .setDescription('Show a ride-friendly weather forecast.')
      .addStringOption((option) =>
        option
          .setName('location')
          .setDescription('Optional override location. Uses the saved beginning meetup if omitted.')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('period')
          .setDescription('Pick today, a weekday, weekend, or a 10-day outlook.')
          .addChoices(
            { name: 'Today', value: 'today' },
            { name: 'Tomorrow', value: 'tomorrow' },
            { name: 'Weekend', value: 'weekend' },
            { name: '10 Day', value: 'ten_day' },
            { name: 'Monday', value: 'monday' },
            { name: 'Tuesday', value: 'tuesday' },
            { name: 'Wednesday', value: 'wednesday' },
            { name: 'Thursday', value: 'thursday' },
            { name: 'Friday', value: 'friday' },
            { name: 'Saturday', value: 'saturday' },
            { name: 'Sunday', value: 'sunday' },
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('view')
          .setDescription('How dense the hourly forecast should be for single-day views.')
          .addChoices(
            { name: 'Every hour', value: 'hourly' },
            { name: 'Every 3 hours', value: 'three_hour' },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('automate')
      .setDescription('Schedule weather posts using the saved beginning meetup location.')
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel to post scheduled weather updates into.')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('days')
          .setDescription('Comma-separated weekdays, for example saturday,sunday.')
          .setRequired(true)
          .setMaxLength(120),
      )
      .addStringOption((option) =>
        option
          .setName('time_local')
          .setDescription('Local post time in 24-hour format, for example 07:30.')
          .setRequired(true)
          .setMaxLength(5),
      )
      .addStringOption((option) =>
        option
          .setName('view')
          .setDescription('How dense the posted forecast should be.')
          .addChoices(
            { name: 'Every hour', value: 'hourly' },
            { name: 'Every 3 hours', value: 'three_hour' },
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('alert_mode')
          .setDescription('Post every scheduled forecast, or only when the ride window looks rough.')
          .addChoices(
            { name: 'Only when weather looks bad', value: 'bad_only' },
            { name: 'Always post', value: 'always' },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('automate_clear')
      .setDescription('Turn off scheduled weather posts while keeping the saved location.'),
  );

const locationCommand = new SlashCommandBuilder()
  .setName('location')
  .setDescription('Save and show this server\'s ride meetup locations.')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('beginning')
      .setDescription('Save the ride beginning location for this server.')
      .addStringOption((option) =>
        option
          .setName('location')
          .setDescription('Ride start location, address, or meetup description.')
          .setRequired(true)
          .setMaxLength(200),
      )
      .addStringOption((option) =>
        option
          .setName('maps_url')
          .setDescription('Optional Google Maps share URL or iframe snippet to use for previews.')
          .setRequired(false)
          .setMaxLength(2000),
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('end')
      .setDescription('Save the ride end location for this server.')
      .addStringOption((option) =>
        option
          .setName('location')
          .setDescription('Ride end location, address, or destination.')
          .setRequired(true)
          .setMaxLength(200),
      )
      .addStringOption((option) =>
        option
          .setName('maps_url')
          .setDescription('Optional Google Maps share URL or iframe snippet to use for previews.')
          .setRequired(false)
          .setMaxLength(2000),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('get')
      .setDescription('Show the saved meetup location details for this server.')
      .addStringOption((option) =>
        option
          .setName('target')
          .setDescription('Which saved location to show.')
          .addChoices(
            { name: 'Both', value: 'both' },
            { name: 'Beginning', value: 'beginning' },
            { name: 'End', value: 'end' },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('clear')
      .setDescription('Remove the saved beginning and end ride locations for this server.'),
  );

export const commandDefinitions = [
  marketplaceCommand.toJSON(),
  stravaCommand.toJSON(),
  weatherCommand.toJSON(),
  locationCommand.toJSON(),
];

async function sendInteractionEmbeds(interaction, embeds, content) {
  if (!embeds || embeds.length === 0) {
    await interaction.editReply({ content: content || 'No results were returned.' });
    return;
  }

  await interaction.editReply({
    content,
    embeds: embeds.slice(0, 10),
  });

  for (let index = 10; index < embeds.length; index += 10) {
    await interaction.followUp({ embeds: embeds.slice(index, index + 10) });
  }
}

async function sendLocationInteraction(interaction, embeds, {
  primaryMapUrl = null,
  primaryMapLabel = null,
  extraMapPosts = [],
  content = null,
  ephemeral = false,
} = {}) {
  await sendInteractionEmbeds(interaction, embeds, content);

  if (primaryMapUrl) {
    await interaction.followUp({
      content: primaryMapLabel
        ? `**Google Maps: ${primaryMapLabel}**\n${primaryMapUrl}`
        : primaryMapUrl,
      ephemeral,
    });
  }

  for (const mapPost of extraMapPosts.filter((entry) => entry?.url)) {
    await interaction.followUp({
      content: mapPost.label
        ? `**Google Maps: ${mapPost.label}**\n${mapPost.url}`
        : mapPost.url,
      ephemeral,
    });
  }
}

function ensureForumChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildForum) {
    throw new Error('That channel is not a forum channel. Please choose a Discord forum channel.');
  }
}

function ensureTextChannel(channel) {
  if (!channel?.isTextBased?.()) {
    throw new Error('That channel is not text-based.');
  }
}

function ensureNetworkAllowed(interaction, networkGuildAllowlist) {
  if (networkGuildAllowlist.length > 0 && !networkGuildAllowlist.includes(interaction.guildId)) {
    throw new Error('This server is not in the configured network allowlist.');
  }
}

function parseWeatherDays(rawValue) {
  const allowedDays = new Set([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]);
  const values = [...new Set(
    rawValue
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )];

  if (values.length === 0) {
    throw new Error('Please provide at least one weekday, for example saturday or saturday,sunday.');
  }

  const invalid = values.filter((value) => !allowedDays.has(value));
  if (invalid.length > 0) {
    throw new Error(`Invalid weekday value(s): ${invalid.join(', ')}. Use full weekday names like saturday,sunday.`);
  }

  return values;
}

function ensureLocalTime(value) {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    throw new Error('Time must use 24-hour HH:MM format, for example 07:30.');
  }

  return value;
}

function normalizeMapsUrlInput(rawValue) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  const iframeMatch = trimmed.match(/src="([^"]+)"/i);
  const candidate = iframeMatch?.[1] || trimmed;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid protocol');
    }

    return url.toString();
  } catch {
    throw new Error('Google Maps URL must be a valid share link or iframe snippet.');
  }
}

function formatDestinationLine(entry) {
  return `- **${entry.guildName}** receives synced posts in #${entry.forumChannelName}`;
}

function formatWatchedForumLine(entry) {
  const inviteSuffix = entry.inviteUrl ? ` | invite: ${entry.inviteUrl}` : '';
  return `- **${entry.teamName}** publishes from **${entry.guildName}** / #${entry.forumChannelName}${inviteSuffix}`;
}

function formatStravaStatus(config, connection) {
  const requestedScopes = 'read, activity:read';
  const lines = [
    config
      ? `Club ID: \`${config.defaultClubId}\``
      : 'Club ID: not configured',
    config?.leaderboardChannelId
      ? `Leaderboard digest: <#${config.leaderboardChannelId}> every ${config.leaderboardIntervalMinutes} minute(s)`
      : 'Leaderboard digest: disabled',
    config?.recentActivityChannelId
      ? `Recent activity digest: <#${config.recentActivityChannelId}> every ${config.recentActivityIntervalMinutes} minute(s)`
      : 'Recent activity digest: disabled',
  ];

  if (connection) {
    const athleteName = connection.athleteName || 'Unknown athlete';
    lines.push(`Connected athlete: **${athleteName}** (\`${connection.athleteId ?? 'unknown'}\`)`);
    lines.push(`Scopes: ${connection.scopes.length > 0 ? connection.scopes.join(', ') : 'unknown'}`);
    lines.push(`Requested bot scopes: ${requestedScopes}`);
    lines.push(`Token expires at: ${connection.expiresAt || 'unknown'}`);

    if (!connection.scopes.includes('activity:read')) {
      lines.push('Warning: reconnect with `activity:read` to enable correct leaderboard totals plus ride timestamps/photos.');
    }
  } else {
    lines.push('Connected athlete: not connected yet');
  }

  return lines.join('\n');
}

export async function registerGuildCommands(client) {
  await Promise.all(client.guilds.cache.map((guild) => registerCommandsForGuild(guild)));
}

export async function registerCommandsForGuild(guild) {
  await guild.commands.set(commandDefinitions);
}

async function handleMarketplaceCommand(interaction, {
  store,
  marketplaceService,
  networkGuildAllowlist,
}) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'marketplace') {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'This command only works inside a server.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'setup') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const forum = interaction.options.getChannel('forum', true);
      ensureForumChannel(forum);

      await store.upsertDestination({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        forumChannelId: forum.id,
        forumChannelName: forum.name,
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      await interaction.editReply(`This server is now subscribed to the shared marketplace network via **${forum.name}**. New posts from watched source forums across the network will appear there.`);
      return true;
    }

    if (subcommand === 'disconnect') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const removed = await store.removeDestination(interaction.guildId);
      if (!removed) {
        await interaction.editReply('This server does not currently have a destination forum configured.');
        return true;
      }

      await interaction.editReply(`Removed **${removed.forumChannelName}** as this server's synced destination forum.`);
      return true;
    }

    if (subcommand === 'watch') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const forum = interaction.options.getChannel('forum', true);
      ensureForumChannel(forum);

      const teamName = interaction.options.getString('team_name')?.trim() || interaction.guild.name;
      const manualInviteUrl = interaction.options.getString('invite_url')?.trim() || null;
      const inviteUrl = await marketplaceService.ensureForumInviteUrl(forum, manualInviteUrl);

      await store.upsertWatchedForum({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        forumChannelId: forum.id,
        forumChannelName: forum.name,
        teamName,
        inviteUrl,
        watchedByUserId: interaction.user.id,
        watchedAt: new Date().toISOString(),
      });

      await interaction.editReply(`Watching **${forum.name}** as **${teamName}**.${inviteUrl ? ` Invite link saved: ${inviteUrl}` : ' No invite link available yet.'} New posts there will be shared to every connected destination server.`);
      return true;
    }

    if (subcommand === 'unwatch') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const forum = interaction.options.getChannel('forum', true);
      ensureForumChannel(forum);

      const removed = await store.removeWatchedForum(forum.id);
      if (!removed) {
        await interaction.editReply(`Nothing was registered for **${forum.name}**, so there was nothing to remove.`);
        return true;
      }

      await interaction.editReply(`Stopped watching **${forum.name}** in **${removed.guildName}**.`);
      return true;
    }

    if (subcommand === 'list') {
      const destination = store.getDestination(interaction.guildId);
      const localWatchedForums = store.getWatchedForumsForGuild(interaction.guildId);
      const destinations = store.getDestinations();
      const watchedForums = store.getWatchedForums();

      const lines = [
        destination
          ? `Destination forum: **${destination.guildName}** / #${destination.forumChannelName}`
          : 'Destination forum: not configured on this server',
        '',
        localWatchedForums.length > 0
          ? localWatchedForums.map(formatWatchedForumLine).join('\n')
          : 'No watched source forums on this server yet.',
        '',
        `Network totals: ${destinations.length} destination server(s), ${watchedForums.length} watched source forum(s).`,
      ];

      await interaction.editReply(lines.join('\n'));
      return true;
    }

    if (subcommand === 'network') {
      const destinations = store.getDestinations();
      const watchedForums = store.getWatchedForums();

      const lines = [
        '**Destination servers**',
        destinations.length > 0 ? destinations.map(formatDestinationLine).join('\n') : 'No destination servers configured yet.',
        '',
        '**Watched source forums**',
        watchedForums.length > 0 ? watchedForums.map(formatWatchedForumLine).join('\n') : 'No watched source forums configured yet.',
      ];

      await interaction.editReply(lines.join('\n'));
      return true;
    }

    if (subcommand === 'backfill') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const limit = interaction.options.getInteger('limit') ?? 10;
      const summary = await marketplaceService.backfill(limit);

      const responseLines = [
        'Backfill complete.',
        `Source threads scanned: ${summary.scannedThreads}`,
        `Mirrored copies created: ${summary.mirroredCopies}`,
        `Skipped threads: ${summary.skippedThreads}`,
      ];

      if (summary.errors.length > 0) {
        responseLines.push(`Errors: ${summary.errors.join(' | ')}`);
      }

      await interaction.editReply(responseLines.join('\n'));
      return true;
    }

    if (subcommand === 'diagnose') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const diagnosis = await marketplaceService.diagnoseGuild(interaction.guildId);
      const lines = [
        `Marketplace diagnosis for **${interaction.guild.name}**`,
        `Destination forums checked: ${diagnosis.destinationCount}`,
        `Watched source forums checked: ${diagnosis.watchedCount}`,
        '',
        ...diagnosis.lines,
      ];

      await interaction.editReply(lines.join('\n'));
      return true;
    }

    if (subcommand === 'diagnose_network') {
      ensureNetworkAllowed(interaction, networkGuildAllowlist);

      const diagnosis = await marketplaceService.diagnoseNetwork();
      const lines = [
        `Marketplace network diagnosis`,
        `Guilds checked: ${diagnosis.guildCount}`,
        '',
        ...diagnosis.lines,
      ];

      await interaction.editReply(lines.join('\n'));
      return true;
    }

    await interaction.editReply('That subcommand is not implemented yet.');
    return true;
  } catch (error) {
    logError('Marketplace command failed', {
      command: 'marketplace',
      subcommand: interaction.options.getSubcommand(false),
      guildId: interaction.guildId,
      guildName: interaction.guild?.name,
      userId: interaction.user?.id,
      error,
    });
    await interaction.editReply(`I hit a setup issue: ${error.message}`);
    return true;
  }
}

async function handleStravaCommand(interaction, { stravaService, stravaScheduler }) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'strava') {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'This command only works inside a server.',
      ephemeral: true,
    });
    return true;
  }

  const adminOnlySubcommands = new Set(['setup', 'connect', 'disconnect', 'status', 'clear', 'run_digest']);
  const subcommand = interaction.options.getSubcommand(true);
  const ephemeral = adminOnlySubcommands.has(subcommand);
  await interaction.deferReply({ ephemeral });

  try {
    if (adminOnlySubcommands.has(subcommand) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error('You need Manage Server permission to use this Strava admin command.');
    }

    if (subcommand === 'setup') {
      const clubId = interaction.options.getString('club_id', true).trim();
      const leaderboardChannel = interaction.options.getChannel('leaderboard_channel');
      const leaderboardIntervalMinutes = interaction.options.getInteger('leaderboard_interval_minutes') ?? 1440;
      const recentActivityChannel = interaction.options.getChannel('recent_activity_channel');
      const recentActivityIntervalMinutes = interaction.options.getInteger('recent_activity_interval_minutes') ?? 360;

      if (leaderboardChannel) {
        ensureTextChannel(leaderboardChannel);
      }

      if (recentActivityChannel) {
        ensureTextChannel(recentActivityChannel);
      }

      await stravaService.upsertGuildConfig({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        defaultClubId: clubId,
        leaderboardChannelId: leaderboardChannel?.id ?? null,
        leaderboardIntervalMinutes,
        recentActivityChannelId: recentActivityChannel?.id ?? null,
        recentActivityIntervalMinutes,
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      await interaction.editReply(`Saved Strava config for **${interaction.guild.name}**.\n${formatStravaStatus(stravaService.getGuildConfig(interaction.guildId), stravaService.getConnectionSummary(interaction.guildId))}`);
      return true;
    }

    if (subcommand === 'connect') {
      const session = await stravaService.createConnectSession({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        requestedByUserId: interaction.user.id,
      });

      await interaction.editReply(`Open this URL to connect Strava for **${interaction.guild.name}**:\n${session.url}\n\nThis link requests: \`${stravaService.oauthScopes.join(', ')}\`\nUse a Strava account that can actually see the club you plan to configure for this server. If you were previously connected with narrower scopes, this flow now forces a fresh consent screen.`);
      return true;
    }

    if (subcommand === 'disconnect') {
      const disconnected = await stravaService.deauthorizeGuild(interaction.guildId);
      await interaction.editReply(disconnected ? 'Disconnected this server from Strava.' : 'This server was not connected to Strava.');
      return true;
    }

    if (subcommand === 'status') {
      await interaction.editReply(formatStravaStatus(
        stravaService.getGuildConfig(interaction.guildId),
        stravaService.getConnectionSummary(interaction.guildId),
      ));
      return true;
    }

    if (subcommand === 'clear') {
      const removed = await stravaService.clearGuildConfig(interaction.guildId);
      await interaction.editReply(removed ? 'Removed this server\'s Strava club and digest configuration.' : 'This server had no Strava configuration to remove.');
      return true;
    }

    if (subcommand === 'club') {
      const clubId = interaction.options.getString('club_id') || null;
      const club = await stravaService.getClub(clubId, interaction.guildId);
      await interaction.editReply({ embeds: [stravaService.buildClubEmbed(club)] });
      return true;
    }

    if (subcommand === 'leaderboard') {
      stravaService.ensureRichStravaRuntimeConfigured();
      const clubId = stravaService.ensureClubId(interaction.options.getString('club_id') || null, interaction.guildId);
      const weekOffset = interaction.options.getInteger('week_offset') ?? 0;
      const club = await stravaService.getClub(clubId, interaction.guildId);
      let embeds;

      try {
        const entries = await stravaService.getClubLeaderboard(clubId, interaction.guildId, weekOffset);
        embeds = stravaService.buildLeaderboardEmbeds({
          clubName: club.name,
          clubId,
          clubProfile: club.profile_medium || club.profile || null,
          clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
          entries,
          weekOffset,
          mode: 'weekly',
          activityCount: entries.reduce((count, entry) => count + (entry.activity_count || 0), 0),
          note: 'Built from timestamped activities available in the official Strava club activity API.',
        });
      } catch {
        const { entries, activityCount } = await stravaService.getClubFeedLeaderboard(clubId, interaction.guildId);
        embeds = stravaService.buildLeaderboardEmbeds({
          clubName: club.name,
          clubId,
          clubProfile: club.profile_medium || club.profile || null,
          clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
          entries,
          weekOffset,
          mode: 'snapshot',
          activityCount,
          note: weekOffset === 0
            ? 'This club feed does not expose enough timing data for an exact weekly board, so this ranking is based on the latest official recent-activity rows.'
            : 'Historical week buckets are not exposed in the official club feed, so this ranking reflects the latest recent-activity rows instead.',
        });
      }

      await sendInteractionEmbeds(interaction, embeds);
      return true;
    }

    if (subcommand === 'recent') {
      stravaService.ensureRichStravaRuntimeConfigured();
      const clubId = stravaService.ensureClubId(interaction.options.getString('club_id') || null, interaction.guildId);
      const limit = interaction.options.getInteger('limit') ?? 10;
      const [club, activitySummaries] = await Promise.all([
        stravaService.getClub(clubId, interaction.guildId),
        stravaService.getClubActivities(clubId, interaction.guildId, 1, limit),
      ]);
      const activities = await stravaService.hydrateActivities(activitySummaries, interaction.guildId);
      const missingActivityRead = !stravaService.hasGuildScope(interaction.guildId, 'activity:read');
      const embeds = stravaService.buildRecentActivityEmbeds({
        clubName: club.name,
        clubId,
        clubProfile: club.profile_medium || club.profile || null,
        clubCoverPhoto: club.cover_photo || club.cover_photo_small || null,
        activities,
      });
      await sendInteractionEmbeds(
        interaction,
        embeds,
        missingActivityRead
          ? 'Reconnect Strava with `activity:read` to show correct ride times and best-effort photos.'
          : undefined,
      );
      return true;
    }

    if (subcommand === 'run_digest') {
      const kind = interaction.options.getString('kind', true);
      const sent = await stravaScheduler.runGuildDigest(interaction.guildId, kind);
      await interaction.editReply(sent ? `Sent the ${kind} digest now.` : `No ${kind} digest channel is configured for this server, or there was nothing new to send.`);
      return true;
    }

    await interaction.editReply('That Strava subcommand is not implemented yet.');
    return true;
  } catch (error) {
    logError('Strava command failed', {
      command: 'strava',
      subcommand,
      guildId: interaction.guildId,
      guildName: interaction.guild?.name,
      userId: interaction.user?.id,
      error,
    });
    await interaction.editReply(`Strava request failed: ${error.message}`);
    return true;
  }
}

async function handleLocationCommand(interaction, { store, weatherService }) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'location') {
    return false;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'This command only works inside a server.',
      ephemeral: true,
    });
    return true;
  }

  const subcommand = interaction.options.getSubcommand(true);
  const adminOnlySubcommands = new Set(['beginning', 'end', 'clear']);
  const ephemeral = adminOnlySubcommands.has(subcommand);
  await interaction.deferReply({ ephemeral });

  try {
    if (adminOnlySubcommands.has(subcommand) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error('You need Manage Server permission to change meetup location or weather automation settings.');
    }

    if (subcommand === 'beginning') {
      const locationQuery = interaction.options.getString('location', true).trim();
      const customMapsUrl = normalizeMapsUrlInput(interaction.options.getString('maps_url'));
      const beginningLocation = await weatherService.geocodeLocation(locationQuery);
      const saved = await store.upsertWeatherGuildConfig({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        beginningQuery: locationQuery,
        beginningLabel: beginningLocation.display_name || [beginningLocation.name, beginningLocation.admin1, beginningLocation.country_code].filter(Boolean).join(', '),
        beginningLatitude: beginningLocation.latitude,
        beginningLongitude: beginningLocation.longitude,
        beginningAdmin1: beginningLocation.admin1 ?? null,
        beginningCountryCode: beginningLocation.country_code ?? null,
        beginningTimezone: beginningLocation.timezone || 'America/Chicago',
        beginningMapsUrl: customMapsUrl || weatherService.buildMapsUrl(
          beginningLocation.display_name
          || beginningLocation.full_display_name
          || locationQuery,
        ),
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      const embeds = weatherService.buildLocationEmbeds(saved, { target: 'beginning' });
      await sendLocationInteraction(
        interaction,
        embeds,
        {
          primaryMapUrl: saved.beginningMapsUrl || null,
          primaryMapLabel: saved.beginningLabel || saved.beginningQuery || 'Beginning location',
          ephemeral,
        },
      );
      return true;
    }

    if (subcommand === 'end') {
      const locationQuery = interaction.options.getString('location', true).trim();
      const customMapsUrl = normalizeMapsUrlInput(interaction.options.getString('maps_url'));
      const endLocation = await weatherService.geocodeLocation(locationQuery);
      const existing = store.getWeatherGuildConfig(interaction.guildId);
      const beginningAddress = existing?.beginningLabel || existing?.beginningQuery || null;
      const saved = await store.upsertWeatherGuildConfig({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        endQuery: locationQuery,
        endLabel: endLocation.display_name || [endLocation.name, endLocation.admin1, endLocation.country_code].filter(Boolean).join(', '),
        endLatitude: endLocation.latitude,
        endLongitude: endLocation.longitude,
        endAdmin1: endLocation.admin1 ?? null,
        endCountryCode: endLocation.country_code ?? null,
        endTimezone: endLocation.timezone || existing?.beginningTimezone || 'America/Chicago',
        endMapsUrl: customMapsUrl || weatherService.buildMapsUrl(
          endLocation.display_name
          || endLocation.full_display_name
          || locationQuery,
        ),
        directionsUrl: beginningAddress
          ? weatherService.buildDirectionsUrl(beginningAddress, endLocation.display_name || locationQuery)
          : null,
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      const embeds = weatherService.buildLocationEmbeds(saved, { target: 'end' });
      await sendLocationInteraction(
        interaction,
        embeds,
        {
          primaryMapUrl: saved.endMapsUrl || null,
          primaryMapLabel: saved.endLabel || saved.endQuery || 'End location',
          directionsUrl: null,
          ephemeral,
        },
      );
      return true;
    }

    if (subcommand === 'get') {
      const config = store.getWeatherGuildConfig(interaction.guildId);
      const requestedTarget = interaction.options.getString('target') || 'both';
      const hasBeginning = Boolean(config?.beginningLabel);
      const hasEnd = Boolean(config?.endLabel);

      if (!hasBeginning && !hasEnd) {
        await interaction.editReply('No meetup location is configured for this server yet. Use `/location beginning` or `/location end` first.');
        return true;
      }

      const target = requestedTarget === 'both'
        ? (hasBeginning && hasEnd ? 'both' : hasBeginning ? 'beginning' : 'end')
        : requestedTarget;

      const embeds = weatherService.buildLocationEmbeds(config, { target });
      await sendLocationInteraction(interaction, embeds, {
        primaryMapUrl: target === 'end'
          ? (config.endMapsUrl || null)
          : (config.beginningMapsUrl || config.endMapsUrl || null),
        primaryMapLabel: target === 'end'
          ? (config.endLabel || config.endQuery || 'End location')
          : (config.beginningLabel || config.beginningQuery || config.endLabel || config.endQuery || 'Ride meetup'),
        extraMapPosts: target === 'both'
          ? [
              config.endMapsUrl
                ? {
                    url: config.endMapsUrl,
                    label: config.endLabel || config.endQuery || 'End location',
                  }
                : null,
            ].filter(Boolean)
          : [],
        ephemeral,
      });
      return true;
    }

    if (subcommand === 'clear') {
      const removed = await store.removeWeatherGuildConfig(interaction.guildId);
      await interaction.editReply(removed ? 'Removed this server\'s saved ride meetup locations and weather automation settings.' : 'This server did not have saved ride meetup locations.');
      return true;
    }

    await interaction.editReply('That location subcommand is not implemented yet.');
    return true;
  } catch (error) {
    logError('Location command failed', {
      command: 'location',
      subcommand,
      guildId: interaction.guildId,
      guildName: interaction.guild?.name,
      userId: interaction.user?.id,
      error,
    });
    await interaction.editReply(`Location request failed: ${error.message}`);
    return true;
  }
}

async function handleWeatherCommand(interaction, { store, weatherService }) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'weather') {
    return false;
  }

  const subcommand = interaction.options.getSubcommand(true);
  const adminOnlySubcommands = new Set(['automate', 'automate_clear']);
  await interaction.deferReply({ ephemeral: adminOnlySubcommands.has(subcommand) });

  try {
    if (adminOnlySubcommands.has(subcommand) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error('You need Manage Server permission to change weather automation settings.');
    }

    if (subcommand === 'forecast') {
      const configuredLocation = interaction.inGuild() ? store.getWeatherGuildConfig(interaction.guildId) : null;
      const explicitLocation = interaction.options.getString('location');
      const storedBeginning = weatherService.buildStoredLocationProfile(configuredLocation, 'beginning');
      const location = explicitLocation || configuredLocation?.beginningQuery || configuredLocation?.beginningLabel || 'Chicago, IL';
      const view = interaction.options.getString('view') || 'three_hour';
      const period = interaction.options.getString('period') || 'today';
      const forecast = await weatherService.getRideForecast({
        locationQuery: location,
        view,
        period,
        resolvedLocation: !explicitLocation ? storedBeginning : null,
      });
      const embeds = weatherService.buildRideWeatherEmbeds(forecast);
      await sendInteractionEmbeds(
        interaction,
        embeds,
        !explicitLocation && configuredLocation?.beginningLabel
          ? `Using saved beginning ride location for **${interaction.guild?.name || 'this server'}**: ${configuredLocation.beginningLabel}`
          : undefined,
      );
      return true;
    }

    if (subcommand === 'automate') {
      const existing = store.getWeatherGuildConfig(interaction.guildId);
      if (!existing?.beginningLabel) {
        throw new Error('Save a beginning ride location first with `/location beginning` before enabling weather automation.');
      }

      const channel = interaction.options.getChannel('channel', true);
      ensureTextChannel(channel);

      const weatherDays = parseWeatherDays(interaction.options.getString('days', true));
      const weatherTimeLocal = ensureLocalTime(interaction.options.getString('time_local', true).trim());
      const weatherView = interaction.options.getString('view') || 'three_hour';
      const weatherAlertMode = interaction.options.getString('alert_mode') || 'bad_only';

      const saved = await store.upsertWeatherGuildConfig({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        weatherChannelId: channel.id,
        weatherDays,
        weatherTimeLocal,
        weatherView,
        weatherAlertMode,
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      const embeds = weatherService.buildLocationEmbeds(saved);
      await sendInteractionEmbeds(
        interaction,
        embeds,
        `Scheduled automatic weather posts in <#${channel.id}> on ${weatherDays.join(', ')} at ${weatherTimeLocal} (${saved.beginningTimezone || 'local'}). Mode: ${weatherAlertMode === 'bad_only' ? 'only when the ride window looks bad' : 'always post'}.`,
      );
      return true;
    }

    if (subcommand === 'automate_clear') {
      const existing = store.getWeatherGuildConfig(interaction.guildId);
      if (!existing?.beginningLabel) {
        await interaction.editReply('This server does not have a saved ride meetup location yet.');
        return true;
      }

      const saved = await store.upsertWeatherGuildConfig({
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        weatherChannelId: null,
        weatherDays: [],
        weatherTimeLocal: null,
        weatherView: 'three_hour',
        weatherAlertMode: 'bad_only',
        lastWeatherAlertKey: null,
        configuredByUserId: interaction.user.id,
        configuredAt: new Date().toISOString(),
      });

      const embeds = weatherService.buildLocationEmbeds(saved);
      await sendInteractionEmbeds(interaction, embeds, 'Turned off scheduled weather posts for this server.');
      return true;
    }

    await interaction.editReply('That weather subcommand is not implemented yet.');
    return true;
  } catch (error) {
    logError('Weather command failed', {
      command: 'weather',
      subcommand,
      guildId: interaction.guildId,
      guildName: interaction.guild?.name,
      userId: interaction.user?.id,
      error,
    });
    await interaction.editReply(`Weather request failed: ${error.message}`);
    return true;
  }
}

export async function handleCommandInteraction(interaction, dependencies) {
  if (await handleMarketplaceCommand(interaction, dependencies)) {
    return true;
  }

  if (await handleStravaCommand(interaction, dependencies)) {
    return true;
  }

  if (await handleLocationCommand(interaction, dependencies)) {
    return true;
  }

  if (await handleWeatherCommand(interaction, dependencies)) {
    return true;
  }

  return false;
}

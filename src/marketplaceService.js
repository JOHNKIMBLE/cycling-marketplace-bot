import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { analyzeListing, buildMirrorThreadName, stripStatusPrefix, truncate } from './listingParser.js';
import { logDebug, logWarn } from './logger.js';

const TARGET_TAG_SYNONYMS = {
  'Complete Bike': ['complete bike', 'bike'],
  Parts: ['parts'],
  Gear: ['gear'],
  Wheels: ['wheels', 'wheelset'],
  Frame: ['frame', 'frameset'],
  ISO: ['iso', 'wanted'],
};

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function normalizeFingerprintText(value) {
  return stripStatusPrefix(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickImageUrl(message) {
  const imageAttachment = message?.attachments?.find((attachment) =>
    attachment.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(attachment.url),
  );

  return imageAttachment?.url ?? null;
}

function collectImageUrls(message) {
  return (message?.attachments ? [...message.attachments.values()] : [])
    .filter((attachment) =>
      attachment.contentType?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp)$/i.test(attachment.url),
    )
    .map((attachment) => attachment.url);
}

function collectNonImageAttachments(message) {
  return (message?.attachments ? [...message.attachments.values()] : [])
    .filter((attachment) => !(attachment.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(attachment.url)))
    .map((attachment) => attachment.url);
}

function extractUrls(text) {
  if (!text) {
    return [];
  }

  const matches = text.match(/https?:\/\/\S+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[)>.,!?]+$/g, '')))];
}

function isUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function buildMirrorContent({
  originalUrl,
  teamName,
  sourceGuildName,
  sourceForumName,
  sellerName,
  price,
  status,
  sellerContact,
  sourceServerInviteUrl,
  bodyLinks,
  imageUrls,
  extraFileUrls,
}) {
  const lines = [
    `Original listing: ${originalUrl}`,
    `Team: ${teamName}`,
    `Source: ${sourceGuildName} / #${sourceForumName}`,
    `Seller: ${sellerName}`,
    sellerContact && !isUrl(sellerContact) ? `Seller contact: ${sellerContact}` : null,
    `Price: ${price ?? 'Not detected'}`,
    `Status: ${status}`,
  ].filter(Boolean);

  if (imageUrls.length > 0) {
    lines.push('');
    lines.push(`Images: ${imageUrls.join(' ')}`);
  }

  if (extraFileUrls.length > 0) {
    lines.push('');
    lines.push(`Extra files: ${extraFileUrls.join(' ')}`);
  }

  return truncate(lines.join('\n'), 1900);
}

async function sendMirrorFollowups(targetThread, bodyLinks, sourceServerInviteUrl = null) {
  const uniqueLinks = [...new Set((bodyLinks || []).filter(Boolean))];

  for (const link of uniqueLinks) {
    await targetThread.send({
      content: link,
      allowedMentions: { parse: [] },
    });
  }

  if (sourceServerInviteUrl) {
    await targetThread.send({
      content: sourceServerInviteUrl,
      allowedMentions: { parse: [] },
    });
  }
}

function buildMirrorEmbed({
  sourceThread,
  sourceGuildName,
  sourceForumName,
  sellerName,
  sellerContact,
  sourceServerInviteUrl,
  analysis,
  body,
  imageUrl,
}) {
  const embed = new EmbedBuilder()
    .setTitle(stripStatusPrefix(sourceThread.name))
    .setURL(sourceThread.url)
    .setDescription(truncate(body?.trim() || analysis.summary, 4000))
    .addFields(
      { name: 'Listing Type', value: analysis.type, inline: true },
      { name: 'Category', value: analysis.category, inline: true },
      { name: 'Price', value: analysis.price ?? 'Not detected', inline: true },
      { name: 'Status', value: analysis.status, inline: true },
      { name: 'Seller', value: sellerName, inline: true },
      ...(sellerContact ? [{ name: 'Seller Contact', value: sellerContact, inline: true }] : []),
      ...(sourceServerInviteUrl ? [{ name: 'Source Server Invite', value: sourceServerInviteUrl, inline: false }] : []),
      { name: 'Source Server', value: sourceGuildName, inline: true },
      { name: 'Source Forum', value: `#${sourceForumName}`, inline: true },
    )
    .setFooter({ text: 'Mirrored by KimbleBot' })
    .setTimestamp(sourceThread.createdTimestamp);

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

function buildMirrorComponents({
  originalUrl,
  sellerUserId,
  sourceServerInviteUrl,
}) {
  const buttons = [];

  if (sellerUserId) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Message Seller')
        .setURL(`https://discord.com/users/${sellerUserId}`),
    );
  }

  if (sourceServerInviteUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Join Source Server')
        .setURL(sourceServerInviteUrl),
    );
  }

  if (originalUrl) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('View Original Listing')
        .setURL(originalUrl),
    );
  }

  if (buttons.length === 0) {
    return [];
  }

  return [new ActionRowBuilder().addComponents(buttons)];
}

function buildRelayContent({ prefix, message, includeSourceJump = false }) {
  const lines = [prefix];

  if (message.content?.trim()) {
    lines.push(message.content.trim());
  }

  const attachmentUrls = collectNonImageAttachments(message);
  const imageUrls = (message.attachments ? [...message.attachments.values()] : [])
    .filter((attachment) => attachment.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(attachment.url))
    .map((attachment) => attachment.url);
  const allAttachments = [...imageUrls, ...attachmentUrls];

  if (allAttachments.length > 0) {
    lines.push('');
    lines.push(`Attachments: ${allAttachments.join(' ')}`);
  }

  if (includeSourceJump) {
    lines.push('');
    lines.push(`Jump to source: ${message.url}`);
  }

  return lines.join('\n').trim();
}

function resolveAppliedTags(targetForum, category) {
  const acceptedNames = TARGET_TAG_SYNONYMS[category] ?? [];

  if (acceptedNames.length === 0) {
    return [];
  }

  const matchingTag = targetForum.availableTags.find((tag) => acceptedNames.includes(normalizeName(tag.name)));
  return matchingTag ? [matchingTag.id] : [];
}

async function resolveStarterMessage(thread) {
  try {
    return await thread.fetchStarterMessage();
  } catch (error) {
    try {
      return await thread.messages.fetch(thread.id);
    } catch (fallbackError) {
      const context = {
        component: 'marketplaceService',
        threadId: thread.id,
        threadName: thread.name,
        guildId: thread.guildId,
        guildName: thread.guild?.name,
        parentId: thread.parentId,
        error: fallbackError,
      };

      if (fallbackError?.message === 'Missing Access' || fallbackError?.code === 50001) {
        logDebug('Skipping starter message fetch because the bot lacks access to that source thread message', context);
        return null;
      }

      logWarn('Unable to fetch starter message for source thread', context);
      return null;
    }
  }
}

async function resolveSellerName(thread, starterMessage) {
  if (starterMessage?.member?.displayName) {
    return starterMessage.member.displayName;
  }

  if (starterMessage?.author?.globalName || starterMessage?.author?.username) {
    return starterMessage.author.globalName || starterMessage.author.username;
  }

  try {
    const member = await thread.guild.members.fetch(thread.ownerId);
    return member.displayName;
  } catch {
    return 'Unknown seller';
  }
}

async function resolveForumChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.type === ChannelType.GuildForum ? channel : null;
}

function buildListingFingerprint({ title, sellerName, price, bodyLinks }) {
  const normalizedTitle = normalizeFingerprintText(title);
  const normalizedSeller = normalizeFingerprintText(sellerName);
  const normalizedPrice = (price || '').trim().toLowerCase();
  const normalizedLinks = [...(bodyLinks || [])].sort();

  if (normalizedLinks.length > 0) {
    return `links:${normalizedLinks.join('|')}`;
  }

  if (!normalizedTitle) {
    return null;
  }

  return `title:${normalizedTitle}|seller:${normalizedSeller}|price:${normalizedPrice}`;
}

function describeForumAccess(forumChannel, botMember) {
  const permissions = forumChannel?.permissionsFor?.(botMember);
  if (!permissions) {
    return 'Bot permissions could not be resolved for that forum.';
  }

  const missing = [];
  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    missing.push('View Channels');
  }
  if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
    missing.push('Read Message History');
  }
  if (!permissions.has(PermissionFlagsBits.SendMessagesInThreads)) {
    missing.push('Send Messages in Threads');
  }

  if (missing.length === 0) {
    return 'Discord returned Missing Access even though the current visible permissions look sufficient.';
  }

  return `Missing permissions on #${forumChannel.name}: ${missing.join(', ')}`;
}

function summarizePermissionSet(forumChannel, botMember, requiredFlags) {
  const permissions = forumChannel?.permissionsFor?.(botMember);
  if (!permissions) {
    return {
      missing: ['Unable to resolve permissions'],
      summary: 'Permission state unavailable',
    };
  }

  const missing = requiredFlags
    .filter(({ flag }) => !permissions.has(flag))
    .map(({ label }) => label);

  return {
    missing,
    summary: missing.length === 0
      ? 'permissions OK'
      : `missing ${missing.join(', ')}`,
  };
}

async function resolveThreadChannel(client, threadId) {
  const channel = await client.channels.fetch(threadId).catch(() => null);
  return channel?.isThread?.() ? channel : null;
}

async function resolveMemberLabel(guild, userId, fallbackName) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return fallbackName || 'Unknown member';
  }
}

async function resolveSellerContact(destinationGuild, sellerUserId, inviteUrl) {
  if (sellerUserId) {
    try {
      const member = await destinationGuild.members.fetch(sellerUserId);
      if (member) {
        return `<@${sellerUserId}>`;
      }
    } catch {
      // Fall back to invite URL below.
    }
  }

  return inviteUrl || null;
}

export class MarketplaceService {
  constructor({ client, store }) {
    this.client = client;
    this.store = store;
  }

  async ensureForumInviteUrl(forum, preferredInviteUrl = null) {
    if (preferredInviteUrl) {
      return preferredInviteUrl;
    }

    const permissions = forum?.permissionsFor?.(forum.guild?.members?.me ?? this.client.user);
    if (!permissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
      return null;
    }

    try {
      const invite = await forum.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: false,
        reason: 'Marketplace source invite for mirrored listings',
      });
      return invite?.url ?? null;
    } catch (error) {
      logDebug('Unable to auto-create source server invite', {
        component: 'marketplaceService',
        guildId: forum.guildId,
        forumChannelId: forum.id,
        error,
      });
      return null;
    }
  }

  async buildMirrorPayload(thread, watchedForum) {
    const parentForum = thread.parent?.type === ChannelType.GuildForum ? thread.parent : await resolveForumChannel(this.client, thread.parentId);

    if (!parentForum) {
      throw new Error('source forum is unavailable');
    }

    const sourceServerInviteUrl = await this.ensureForumInviteUrl(parentForum, watchedForum.inviteUrl ?? null);
    if (sourceServerInviteUrl && sourceServerInviteUrl !== watchedForum.inviteUrl) {
      await this.store.upsertWatchedForum({
        ...watchedForum,
        inviteUrl: sourceServerInviteUrl,
      });
    }

    const starterMessage = await resolveStarterMessage(thread);
    const tagNames = (thread.appliedTags ?? [])
      .map((tagId) => parentForum.availableTags.find((tag) => tag.id === tagId)?.name)
      .filter(Boolean);
    const analysis = analyzeListing({
      title: thread.name,
      body: starterMessage?.content ?? '',
      tagNames,
      archived: Boolean(thread.archived),
      locked: Boolean(thread.locked),
    });
    const originalBody = starterMessage?.content ?? '';
    const bodyLinks = extractUrls(originalBody).filter((url) => url !== thread.url);
    const sellerName = await resolveSellerName(thread, starterMessage);
    const imageUrl = pickImageUrl(starterMessage);
    const imageUrls = collectImageUrls(starterMessage);
    const extraFileUrls = collectNonImageAttachments(starterMessage);
    const listingFingerprint = buildListingFingerprint({
      title: thread.name,
      sellerName,
      price: analysis.price,
      bodyLinks,
    });

    return {
      analysis,
      originalBody,
      listingFingerprint,
      sellerName,
      sellerUserId: starterMessage?.author?.id ?? thread.ownerId ?? null,
      sourceServerInviteUrl,
      sourceThread: thread,
      parentForum,
      starterMessage,
      mirrorName: buildMirrorThreadName(watchedForum.teamName, thread.name, analysis.status),
      messagePayloadBase: {
        originalUrl: thread.url,
        teamName: watchedForum.teamName,
        sourceGuildName: watchedForum.guildName,
        sourceForumName: watchedForum.forumChannelName,
        sellerName,
        price: analysis.price,
        status: analysis.status,
        bodyLinks,
        imageUrls,
        extraFileUrls,
        analysis,
        body: originalBody,
        imageUrl,
      },
    };
  }

  async buildDestinationMessagePayload(payload, destinationGuild) {
    const sellerContact = await resolveSellerContact(
      destinationGuild,
      payload.sellerUserId,
      payload.sourceServerInviteUrl,
    );

    return {
      content: buildMirrorContent({
        ...payload.messagePayloadBase,
        sellerContact,
        sourceServerInviteUrl: payload.sourceServerInviteUrl,
      }),
      embeds: [
        buildMirrorEmbed({
          sourceThread: payload.sourceThread,
          sourceGuildName: payload.messagePayloadBase.sourceGuildName,
          sourceForumName: payload.messagePayloadBase.sourceForumName,
          sellerName: payload.messagePayloadBase.sellerName,
          sellerContact,
          sourceServerInviteUrl: payload.sourceServerInviteUrl,
          analysis: payload.messagePayloadBase.analysis,
          body: payload.messagePayloadBase.body,
          imageUrl: payload.messagePayloadBase.imageUrl,
        }),
      ],
      components: buildMirrorComponents({
        originalUrl: payload.messagePayloadBase.originalUrl,
        sellerUserId: payload.sellerUserId,
        sourceServerInviteUrl: payload.sourceServerInviteUrl,
      }),
      allowedMentions: { parse: sellerContact?.startsWith('<@') ? ['users'] : [] },
    };
  }

  async mirrorIfWatched(thread, trigger = 'live') {
    if (!thread?.parentId) {
      return { status: 'skipped', reason: 'thread has no parent forum' };
    }

    const watchedForum = this.store.getWatchedForum(thread.parentId);

    if (!watchedForum) {
      return { status: 'skipped', reason: 'forum is not watched' };
    }

    if (thread.ownerId === this.client.user.id) {
      return { status: 'skipped', reason: 'thread was created by the bot' };
    }

    const destinations = this.store.getDestinations();

    if (destinations.length === 0) {
      return { status: 'skipped', reason: 'no destination forums are configured yet' };
    }

    const eligibleDestinations = destinations.filter(
      (destination) =>
        destination.forumChannelId !== thread.parentId &&
        !this.store.hasMirrorForDestination(thread.id, destination.forumChannelId),
    );

    if (eligibleDestinations.length === 0) {
      return { status: 'skipped', reason: 'thread already mirrored to every destination' };
    }

    const payload = await this.buildMirrorPayload(thread, watchedForum);
    const duplicate = this.store.findMirrorRecordByFingerprint(payload.listingFingerprint, thread.id);
    if (duplicate) {
      return {
        status: 'skipped',
        reason: `possible duplicate of ${duplicate.sourceThreadName || duplicate.sourceThreadId}`,
      };
    }

    const result = {
      status: 'mirrored',
      mirroredCount: 0,
      targetThreadIds: [],
      errors: [],
    };

    for (const destination of eligibleDestinations) {
      try {
        const targetChannel = await resolveForumChannel(this.client, destination.forumChannelId);

        if (!targetChannel) {
          result.errors.push(`${destination.guildName}: destination forum is unavailable`);
          continue;
        }

        const mirroredThread = await targetChannel.threads.create({
          name: payload.mirrorName,
          appliedTags: resolveAppliedTags(targetChannel, payload.analysis.category),
          reason: `Mirror ${trigger} marketplace listing from ${thread.guild.name}`,
          message: await this.buildDestinationMessagePayload(payload, targetChannel.guild),
        });

        if (payload.messagePayloadBase.bodyLinks.length > 0 || payload.sourceServerInviteUrl) {
          await sendMirrorFollowups(
            mirroredThread,
            payload.messagePayloadBase.bodyLinks,
            payload.sourceServerInviteUrl,
          );
        }

        await this.store.recordMirror({
          sourceThreadId: thread.id,
          listingFingerprint: payload.listingFingerprint,
          sourceGuildId: thread.guildId,
          sourceForumChannelId: thread.parentId,
          sourceThreadName: truncate(thread.name, 100),
          sourceSellerUserId: payload.sellerUserId,
          sourceSellerName: payload.sellerName,
          destinationGuildId: destination.guildId,
          destinationForumChannelId: targetChannel.id,
          targetThreadId: mirroredThread.id,
          mirroredAt: new Date().toISOString(),
        });

        result.mirroredCount += 1;
        result.targetThreadIds.push(mirroredThread.id);
      } catch (error) {
        result.errors.push(`${destination.guildName}: ${error.message}`);
      }
    }

    if (result.mirroredCount === 0) {
      return {
        status: 'skipped',
        reason: result.errors.length > 0 ? result.errors.join(' | ') : 'no destinations could be mirrored',
      };
    }

    return result;
  }

  async syncMirrorsForSourceThread(thread, reason = 'update') {
    const watchedForum = this.store.getWatchedForum(thread.parentId);
    const mirrorRecord = this.store.getMirrorRecord(thread.id);

    if (!watchedForum || !mirrorRecord) {
      return { status: 'skipped', reason: 'no mirrors exist for this source thread' };
    }

    const payload = await this.buildMirrorPayload(thread, watchedForum);
    const result = {
      status: 'updated',
      updatedCount: 0,
      errors: [],
    };

    for (const mirror of Object.values(mirrorRecord.mirrors)) {
      try {
        const targetThread = await resolveThreadChannel(this.client, mirror.targetThreadId);

        if (!targetThread) {
          result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: target thread not found`);
          continue;
        }

        await targetThread.edit({
          name: payload.mirrorName,
          archived: thread.archived,
          locked: thread.locked,
          appliedTags: targetThread.parent?.type === ChannelType.GuildForum
            ? resolveAppliedTags(targetThread.parent, payload.analysis.category)
            : undefined,
          reason: `Sync marketplace listing ${reason}`,
        });

        const targetStarterMessage = await resolveStarterMessage(targetThread);
        if (targetStarterMessage) {
          await targetStarterMessage.edit(await this.buildDestinationMessagePayload(payload, targetThread.guild));
        }

        result.updatedCount += 1;
      } catch (error) {
        result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: ${error.message}`);
      }
    }

    return result;
  }

  async closeMirrorsForDeletedSource(sourceThread) {
    const mirrorRecord = this.store.getMirrorRecord(sourceThread.id);

    if (!mirrorRecord) {
      return { status: 'skipped', reason: 'no mirrors exist for deleted thread' };
    }

    const result = {
      status: 'closed',
      updatedCount: 0,
      errors: [],
    };

    for (const mirror of Object.values(mirrorRecord.mirrors)) {
      try {
        const targetThread = await resolveThreadChannel(this.client, mirror.targetThreadId);

        if (!targetThread) {
          result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: target thread not found`);
          continue;
        }

        const renamed = buildMirrorThreadName('Removed', targetThread.name, 'Closed');
        await targetThread.edit({
          name: renamed,
          archived: true,
          locked: true,
          reason: 'Source marketplace thread was deleted',
        });

        const starterMessage = await resolveStarterMessage(targetThread);
        if (starterMessage) {
          await starterMessage.edit({
            content: `${starterMessage.content}\n\nSource thread status: Deleted or unavailable.`,
            embeds: starterMessage.embeds,
            allowedMentions: { parse: [] },
          });
        }

        result.updatedCount += 1;
      } catch (error) {
        result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: ${error.message}`);
      }
    }

    return result;
  }

  async relayMirrorCommentToSource(message) {
    if (message.id === message.channelId) {
      return { status: 'skipped', reason: 'thread starter messages are not relayed' };
    }

    const mirrorRecord = this.store.getMirrorRecordByTargetThreadId(message.channelId);

    if (!mirrorRecord) {
      return { status: 'skipped', reason: 'message is not in a mirrored thread' };
    }

    if (this.store.hasMirrorToSourceRelay(mirrorRecord.sourceThreadId, message.id)) {
      return { status: 'skipped', reason: 'mirror comment already relayed' };
    }

    const sourceThread = await resolveThreadChannel(this.client, mirrorRecord.sourceThreadId);
    if (!sourceThread) {
      return { status: 'skipped', reason: 'source thread not found' };
    }

    if (!sourceThread.sendable) {
      return {
        status: 'skipped',
        reason: 'bot cannot send messages into the source thread; check Send Messages in Threads and thread access',
      };
    }

    const authorLabel = await resolveMemberLabel(message.guild, message.author.id, message.member?.displayName || message.author.globalName || message.author.username);
    const relayPrefix = `Comment from ${message.guild.name} / ${authorLabel}:`;
    const relayContent = buildRelayContent({
      prefix: relayPrefix,
      message,
      includeSourceJump: false,
    });

    const relayedMessage = await sourceThread.send({
      content: relayContent,
      allowedMentions: { parse: [] },
    });

    await this.store.recordMirrorToSourceRelay({
      sourceThreadId: mirrorRecord.sourceThreadId,
      mirrorMessageId: message.id,
      sourceRelayMessageId: relayedMessage.id,
    });

    return {
      status: 'relayed',
      sourceThreadId: mirrorRecord.sourceThreadId,
      relayedMessageId: relayedMessage.id,
    };
  }

  async relaySellerReplyToMirrors(message) {
    const mirrorRecord = this.store.getMirrorRecord(message.channelId);

    if (!mirrorRecord) {
      return { status: 'skipped', reason: 'message is not in a source thread with mirrors' };
    }

    if (!mirrorRecord.sourceSellerUserId || message.author.id !== mirrorRecord.sourceSellerUserId) {
      return { status: 'skipped', reason: 'message is not from the source seller' };
    }

    if (message.id === message.channelId) {
      return { status: 'skipped', reason: 'starter listing message is handled elsewhere' };
    }

    const result = {
      status: 'relayed',
      relayedCount: 0,
      errors: [],
    };

    for (const mirror of Object.values(mirrorRecord.mirrors)) {
      try {
        if (this.store.hasSourceToMirrorRelay(mirrorRecord.sourceThreadId, message.id, mirror.targetThreadId)) {
          continue;
        }

        const targetThread = await resolveThreadChannel(this.client, mirror.targetThreadId);
        if (!targetThread) {
          result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: target thread not found`);
          continue;
        }

        if (!targetThread.sendable) {
          result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: bot cannot send messages in target thread`);
          continue;
        }

        const sellerLabel = mirrorRecord.sourceSellerName
          || message.member?.displayName
          || message.author.globalName
          || message.author.username;
        const relayPrefix = `Seller reply from ${message.guild.name} / ${sellerLabel}:`;
        const relayContent = buildRelayContent({
          prefix: relayPrefix,
          message,
          includeSourceJump: true,
        });

        const relayedMessage = await targetThread.send({
          content: relayContent,
          allowedMentions: { parse: [] },
        });

        await this.store.recordSourceToMirrorRelay({
          sourceThreadId: mirrorRecord.sourceThreadId,
          sourceMessageId: message.id,
          targetThreadId: mirror.targetThreadId,
          relayedMessageId: relayedMessage.id,
        });

        result.relayedCount += 1;
      } catch (error) {
        result.errors.push(`${mirror.destinationGuildId ?? mirror.destinationForumChannelId}: ${error.message}`);
      }
    }

    if (result.relayedCount === 0) {
      return {
        status: 'skipped',
        reason: result.errors.length > 0 ? result.errors.join(' | ') : 'seller reply already relayed everywhere',
      };
    }

    return result;
  }

  async backfill(limitPerForum = 10) {
    const watchedForums = this.store.getWatchedForums();
    const summary = {
      mirroredCopies: 0,
      scannedThreads: 0,
      skippedThreads: 0,
      errors: [],
    };

    for (const watchedForum of watchedForums) {
      try {
        const sourceForum = await resolveForumChannel(this.client, watchedForum.forumChannelId);

        if (!sourceForum) {
          summary.skippedThreads += 1;
          continue;
        }

        let activeThreads = [];
        let archivedThreads = [];

        try {
          const active = await sourceForum.threads.fetchActive();
          activeThreads = [...active.threads.values()];
        } catch (error) {
          if (error?.message === 'Missing Access' || error?.code === 50001) {
            summary.errors.push(`${watchedForum.teamName}: cannot list active threads in #${sourceForum.name}. ${describeForumAccess(sourceForum, this.client.user)}`);
            continue;
          }

          throw error;
        }

        try {
          const archived = await sourceForum.threads.fetchArchived({
            type: 'public',
            limit: limitPerForum,
          });
          archivedThreads = [...archived.threads.values()];
        } catch (error) {
          if (error?.message === 'Missing Access' || error?.code === 50001) {
            summary.errors.push(`${watchedForum.teamName}: cannot read archived threads in #${sourceForum.name}. Backfill will use active threads only. ${describeForumAccess(sourceForum, this.client.user)}`);
          } else {
            throw error;
          }
        }

        const candidateThreads = [...new Map(
          [...activeThreads, ...archivedThreads].map((thread) => [thread.id, thread]),
        ).values()]
          .sort((left, right) => (right.createdTimestamp ?? 0) - (left.createdTimestamp ?? 0))
          .slice(0, limitPerForum);

        for (const thread of candidateThreads) {
          summary.scannedThreads += 1;
          const result = await this.mirrorIfWatched(thread, 'backfill');
          if (result.status === 'mirrored') {
            summary.mirroredCopies += result.mirroredCount;
          } else {
            summary.skippedThreads += 1;
          }
        }
      } catch (error) {
        summary.errors.push(`${watchedForum.teamName}: ${error.message}`);
      }
    }

    return summary;
  }

  async diagnoseGuild(guildId) {
    const destination = this.store.getDestination(guildId);
    const watchedForums = this.store.getWatchedForumsForGuild(guildId);
    const lines = [
      '- Note: Developer Portal install permissions only define what the bot can request at install time.',
      '- Actual access is controlled by the live server role permissions plus category/forum channel overrides.',
      '- If this report says a permission is missing, check the forum channel and its parent category in Discord.',
      '',
      '- Recommended destination forum permissions: View Channels, Read Message History, Send Messages, Embed Links, Attach Files, Create Public Threads, Send Messages in Threads.',
      '- Recommended source forum permissions: View Channels, Read Message History.',
      '- Optional source forum permission for automatic invite creation: Create Instant Invite.',
      '',
    ];
    const guild = this.client.guilds.cache.get(guildId) ?? await this.client.guilds.fetch(guildId).catch(() => null);
    const botMember = guild?.members?.me ?? await guild?.members.fetchMe?.().catch(() => null);

    if (!guild || !botMember) {
      return {
        destinationCount: destination ? 1 : 0,
        watchedCount: watchedForums.length,
        lines: ['- Unable to resolve the bot member in this server, so live permission checks could not run.'],
      };
    }

    if (!destination) {
      lines.push('- Destination: not configured');
    } else {
      const forum = await resolveForumChannel(this.client, destination.forumChannelId);
      if (!forum) {
        lines.push(`- Destination #${destination.forumChannelName}: unavailable or not a forum`);
      } else {
        const permissionReport = summarizePermissionSet(forum, botMember, [
          { flag: PermissionFlagsBits.ViewChannel, label: 'View Channels' },
          { flag: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
          { flag: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
          { flag: PermissionFlagsBits.CreatePublicThreads, label: 'Create Public Threads' },
          { flag: PermissionFlagsBits.SendMessagesInThreads, label: 'Send Messages in Threads' },
          { flag: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
          { flag: PermissionFlagsBits.AttachFiles, label: 'Attach Files' },
        ]);

        const parentLabel = forum.parent?.name ? ` under category ${forum.parent.name}` : '';
        lines.push(`- Destination #${forum.name}${parentLabel}: ${permissionReport.summary}`);
        if (permissionReport.missing.length > 0) {
          lines.push(`  Fix: grant ${permissionReport.missing.join(', ')} to the bot/app on this forum or its parent category.`);
        } else {
          lines.push('  OK: destination forum permissions look sufficient for mirrored post creation.');
        }
      }
    }

    if (watchedForums.length === 0) {
      lines.push('- Watched source forums: none configured');
    }

    for (const watchedForum of watchedForums) {
      const forum = await resolveForumChannel(this.client, watchedForum.forumChannelId);
      if (!forum) {
        lines.push(`- Source #${watchedForum.forumChannelName}: unavailable or not a forum`);
        continue;
      }

      const permissionReport = summarizePermissionSet(forum, botMember, [
        { flag: PermissionFlagsBits.ViewChannel, label: 'View Channels' },
        { flag: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
        { flag: PermissionFlagsBits.CreateInstantInvite, label: 'Create Instant Invite (optional)' },
      ]);

      let activeStatus = 'not tested';
      let archivedStatus = 'not tested';

      try {
        const active = await forum.threads.fetchActive();
        activeStatus = `${active.threads.size} active thread(s) visible`;
      } catch (error) {
        activeStatus = error?.message || 'failed';
      }

      try {
        const archived = await forum.threads.fetchArchived({
          type: 'public',
          limit: 2,
        });
        archivedStatus = `${archived.threads.size} archived thread(s) reachable`;
      } catch (error) {
        archivedStatus = error?.message || 'failed';
      }

      const parentLabel = forum.parent?.name ? ` under category ${forum.parent.name}` : '';
      lines.push(`- Source #${forum.name}${parentLabel}: ${permissionReport.summary}`);
      if (permissionReport.missing.length > 0) {
        lines.push(`  Fix: grant ${permissionReport.missing.join(', ')} to the bot/app on this forum or its parent category.`);
      } else {
        lines.push('  OK: source forum permissions look sufficient for reading listings.');
      }
      lines.push(`  Probe: active fetch -> ${activeStatus}`);
      lines.push(`  Probe: archived fetch -> ${archivedStatus}`);
      if (archivedStatus === 'Missing Access') {
        lines.push('  Hint: archived thread access can fail when the forum is private, inherited denies exist, or the bot can see the forum but not archived thread history.');
      }
    }

    return {
      destinationCount: destination ? 1 : 0,
      watchedCount: watchedForums.length,
      lines,
    };
  }

  async diagnoseNetwork() {
    const guildIds = new Set([
      ...this.store.getDestinations().map((entry) => entry.guildId),
      ...this.store.getWatchedForums().map((entry) => entry.guildId),
    ]);

    const lines = [];
    for (const guildId of guildIds) {
      const guild = this.client.guilds.cache.get(guildId) ?? await this.client.guilds.fetch(guildId).catch(() => null);
      const guildName = guild?.name || guildId;
      const diagnosis = await this.diagnoseGuild(guildId);
      lines.push(`**${guildName}**`);
      lines.push(...diagnosis.lines);
      lines.push('');
    }

    return {
      guildCount: guildIds.size,
      lines,
    };
  }
}

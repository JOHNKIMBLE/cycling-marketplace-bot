# Discord Admin Setup Guide

This guide is for Discord server admins and moderators.

It is written to be as simple as possible.

Use this when you want to:

- add the bot to your server
- enable marketplace syncing
- connect Strava
- save a ride meetup location
- turn on automatic weather posts

## What This Bot Can Do

### Marketplace

- copy sale posts from your server into other participating servers
- copy other participating servers’ sale posts into your server
- backfill older marketplace posts
- relay replies between mirrored listings and the original listing
- show clear contact buttons on mirrored listings for seller, source server, and original post

### Strava

- connect your server to a Strava club
- show club info, leaderboard, and recent activity
- post Strava digests automatically
- post a weekly club recap with rider spotlights when leaderboard digests are enabled

### Weather

- save your ride start location
- save an optional ride end location
- show weather for your saved ride location
- automatically post ride weather on chosen days and times
- optionally only post when weekend rain/wind looks bad

## Before You Start

You need:

- permission to invite apps to your Discord server
- permission to manage channels or server settings
- a forum channel for marketplace posts if you want marketplace sync
- a Strava club ID if you want Strava features

## Step 1: Invite the Bot

Ask the bot owner for the invite link.

When Discord asks for permissions, approve them.

The important permissions are:

- `View Channels`
- `Read Message History`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Create Public Threads`
- `Send Messages in Threads`

Recommended extra permission:

- `Create Instant Invite`

Why that helps:

- the bot can automatically generate source-server invite links for mirrored marketplace posts

## Step 2: Check Channel Permissions

This is the part that usually trips people up.

Even if the invite screen looked correct, the forum channel itself can still block the bot.

For every marketplace forum channel the bot will use, make sure the bot role or app can:

- `View Channel`
- `Read Message History`
- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Create Public Threads`
- `Send Messages in Threads`

Also check:

- the forum channel permissions
- the parent category permissions

If either one denies access, the bot may show `Missing Access` even though the install permissions looked fine.

## Step 3: Decide How Your Server Will Participate

Your server can be:

- a receiver only
- a publisher only
- both

### Receiver Only

Your server wants to receive marketplace listings from other servers.

Use:

```text
/marketplace setup forum:#your-destination-forum
```

### Publisher Only

Your server wants to publish its own marketplace listings out to the network.

Use:

```text
/marketplace watch forum:#your-source-forum
```

### Both

Most servers will want both.

Use both commands:

```text
/marketplace setup forum:#store
/marketplace watch forum:#store
```

## Step 4: Check Your Marketplace Setup

Run:

```text
/marketplace list
```

This shows:

- your destination forum
- your watched source forums
- overall network totals

If something looks wrong, run:

```text
/marketplace diagnose
```

If you want to check the whole connected network, run:

```text
/marketplace diagnose_network
```

## Step 5: Test Marketplace Mirroring

Create one test post in the watched source forum.

The bot should mirror it to every connected destination forum.

If you want to import older recent posts, run:

```text
/marketplace backfill
```

If backfill fails, run:

```text
/marketplace diagnose
```

Then fix the missing permissions it reports.

## Step 6: Connect Strava

Only do this if your server wants Strava features.

### Set the Club

Run:

```text
/strava setup club_id:YOUR_CLUB_ID
```

Optional:

- set leaderboard digest channel
- set recent activity digest channel

### Connect Strava

Run:

```text
/strava connect
```

Open the URL the bot gives you.

Log in with a Strava account that can actually see the club you want to use.

### Confirm It Worked

Run:

```text
/strava status
```

Important:

- the Strava callback page should show `Requested scopes: read, activity:read`

If it only shows `read`, tell the bot owner. The container is running with old env values and needs redeploying.

## Step 7: Save Ride Meetup Locations

### Save the Ride Start

Run:

```text
/location beginning location:Walgreens on Bryn Mawr and Clark, Chicago
```

Or use an exact address:

```text
/location beginning location:5440 N Clark St, Chicago, IL 60640
```

If you already have a Google Maps share link or the `src` from Google’s embed iframe, you can save that too:

```text
/location beginning location:5440 N Clark St, Chicago, IL 60640 maps_url:https://www.google.com/maps/...
```

### Save the Ride End

Optional:

```text
/location end location:Montrose Harbor, Chicago
```

### View Saved Location Info

Show both:

```text
/location get
```

Show only start:

```text
/location get target:beginning
```

Show only end:

```text
/location get target:end
```

## Step 8: Test Weather

Run:

```text
/weather forecast
```

If a beginning location is saved, the bot will use that automatically.

Useful examples:

```text
/weather forecast period:weekend
/weather forecast period:saturday
/weather forecast view:hourly
/weather forecast view:three_hour
```

## Step 9: Turn On Automatic Weather Posts

Pick the channel where weather should go.

Then run something like:

```text
/weather automate channel:#rides days:saturday,sunday time_local:07:30
```

If you only want weather posts when the ride window looks rough, use:

```text
/weather automate channel:#rides days:saturday,sunday time_local:07:30 alert_mode:bad_only
```

This uses the saved beginning location.

To turn it off later:

```text
/weather automate_clear
```

## Common Commands

### Marketplace

```text
/marketplace setup
/marketplace disconnect
/marketplace watch
/marketplace unwatch
/marketplace list
/marketplace network
/marketplace backfill
/marketplace diagnose
/marketplace diagnose_network
```

### Strava

```text
/strava setup
/strava connect
/strava disconnect
/strava status
/strava clear
/strava club
/strava leaderboard
/strava recent
/strava run_digest
```

### Location and Weather

```text
/location beginning
/location end
/location get
/location clear
/weather forecast
/weather automate
/weather automate_clear
```

## If Something Breaks

### Marketplace says `Missing Access`

Check the permissions on the actual forum channel and its parent category.

The bot must be able to:

- view the forum
- read message history
- send messages in threads

### Marketplace post did not mirror

Check:

- did you run `/marketplace watch` on the source server?
- did you run `/marketplace setup` on the destination server?
- does `/marketplace list` show the expected forums?
- does `/marketplace diagnose` show missing permissions?

### Strava looks incomplete

Check:

- did you run `/strava connect`?
- does `/strava status` show a connected athlete?
- does the connected athlete have access to the club?
- did the callback show `read, activity:read`?

### Weather location did not resolve

Try:

- a cleaner intersection description
- an exact street address
- a nearby landmark plus city

Good examples:

- `Walgreens on Bryn Mawr and Clark, Chicago`
- `5440 N Clark St, Chicago, IL 60640`

## Best Practice Setup for a Typical Team

If your team has a `#store` forum and a `#rides` channel:

1. Invite the bot.
2. Confirm forum permissions.
3. Run:

```text
/marketplace setup forum:#store
/marketplace watch forum:#store
```

4. Run:

```text
/location beginning location:Your meetup address here
```

5. Run:

```text
/weather automate channel:#rides days:saturday,sunday time_local:07:30
```

6. If using Strava:

```text
/strava setup club_id:YOUR_CLUB_ID
/strava connect
```

That gives you:

- marketplace sync
- saved meetup location
- weekend weather automation
- Strava club tools

## When To Ask The Bot Owner For Help

Ask the bot owner if:

- Strava callback only shows `read`
- rebuilds seem to forget server config
- `/marketplace diagnose` still reports missing access after permissions were fixed
- the bot is online but clearly running old code

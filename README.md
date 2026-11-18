# herm-t3s

T3 Code-style triage for the Hermes Desktop sidebar session list. Desktop-only, no backend, SDK surface only.

- **Profile badge** on each row: a small coloured square with the profile's initials (the display name is optional). Hover it for a detail card showing project, branch, model, message and tool counts, tokens, cost, last active, and the opening request.
- **Snooze and Settle.** A faint clock sits at the end of each row; hover it to get two buttons. **Snooze** archives the session now and brings it back at the time you pick (1 hour, 3 hours, tomorrow 9 AM, next Monday 9 AM). **Settle** archives it.

It works in both sidebar layouts. Turn on **Inbox style** (sidebar filter menu, Show) for the T3-like two-line card. For a quieter row, untick **Tokens** and **Cost** in the same menu.

## Install

```
hermes plugins install herm-t3s                    # once listed in the catalog
hermes plugins install seanflynnfilm/herm-t3s
```

Then switch it on in Settings, Plugins. Options are under Settings, herm-t3s.

## What it does on your machine (disclosure)

- **Reads** your session list (`host.listPersistedSessions`, all profiles) and profile display names (`profiles.list`) from your own Hermes backend. Makes no network calls to third parties.
- **Writes** only a session's archived flag (`session.archive`): when you press Snooze or Settle, and when a snooze wakes.
- **Stores** pending snoozes and one preference in the plugin's own storage (`ctx.storage`).
- **Runs** a one-minute timer while the app is open to wake due snoozes. Snoozes don't fire while Hermes is closed; they wake at next launch.
- No telemetry, credentials, or shell commands.

## Roadmap

A worded status label (*Working 12s*, *Needs input*, *Done*) will return once the SDK exposes session status to plugins ([hermes-agent#152528](https://github.com/NousResearch/hermes-agent/issues/152528)).

## License

MIT

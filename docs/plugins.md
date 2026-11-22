# Plugins

## What they're for

Plugins let people and agents build new product experiences in Buzz with code,
without changing the app. A designer can build an experimental Channels page on
real data, a team can add a rich integration to conversations, and someone with
the installed app can extend it on the fly, with no upstream contribution and no
dev server.

A plugin can be substantial: several pages, panels, settings and agent tools. It
builds with ordinary React components, the session's shared data (channels,
messages, profiles, agents) and a small set of extension points. The app keeps
navigation, Settings, installation and error boundaries, so a plugin whose page
fails to render doesn't take the rest of the app with it.

Bundled plugins and installed ones use the same contracts. Much of the app
(Channels, Agents, Inbox, GitHub, the agent harnesses) is built as bundled
plugins, and those are the best examples.

## Cordis in brief

Plugins run on Cordis (`@deepseek-ai/cordis`), a small library for services and
lifetimes. Each plugin gets a Cordis context, `ctx`:

- **Services.** The app provides everything through named services: `pages`,
  `react`, `shortcuts`, `notifications`, and so on. A plugin lists the ones it
  needs in `inject`, and its `apply(ctx)` runs only once all of them are
  available.
- **Lifetimes.** Everything a plugin registers through `ctx` belongs to it. When
  the plugin is disabled or replaced, or a service it needs goes away, Cordis
  cleans all of it up. Wrap anything else you start (timers, listeners,
  processes) in `ctx.effect(() => cleanup)`, and it's cleaned up the same way.

So a plugin never has to track its own teardown, and an update can swap it out
while the app runs.

## Stability

**Treat every specific as unstable.** The API is a preview tied to the host
version, nothing is promised across versions, and the author types are versioned
`0.0.0-preview.1`. The code is the reference: the author types in
[`src/plugins/author.ts`](../src/plugins/author.ts) and the bundled plugins in
`src/bundled/`.

Some parts change less often than others:

- **Steadier:** the envelope (manifest, `inject`/`apply`, `ctx.effect`), owning a
  whole page or panel, host access grants, agent tools (`addTool`), shortcuts,
  notifications, settings cards, the host's UI controls, and opening plugin pages,
  Home and Settings.
- **In between:** decisions, and renderers for links and code blocks.
- **Expect breakage:** the relay session read model, conversation contributions,
  sidebar sections and rows, the Solo region and backdrops, agent hooks and the
  harness kit, artifact storage, the plugin installer, federated identity, the
  browser view, and where pages and panels are placed.

## Trust

Plugins aren't sandboxed. They're trusted code in the app's JavaScript, so a
React error boundary can't contain an infinite loop or undo a side effect.
Anything beyond the shared services (commands, processes, network origins,
files) has to be declared in the manifest, and the owner reviews it at install
and again whenever an update asks for more. If a plugin freezes startup, launch
with `BUZZODZ_SAFE_MODE=1` to pause installed plugins for that launch.

## Writing one

Start with the [plugin authoring guide](plugin-authoring-guide.md). Agents also
get it as a tool inside Buzz. For a quick start without the app, see
[`examples/plugins`](../examples/plugins/README.md).

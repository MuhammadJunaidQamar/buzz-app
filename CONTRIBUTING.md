# Contributing to Buzz

This repository holds the Buzz desktop app and the web build that shares its
code. Questions are welcome in the [Buzz community](README.md#3-join-a-community),
and bugs go in [GitHub issues](https://github.com/block/buzz-app/issues).

## Set up

Every tool is pinned with [Hermit](https://cashapp.github.io/hermit/), so you
don't need to install anything globally. The desktop app also needs the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
source bin/activate-hermit
rustup toolchain install
just hooks
```

## Run it

- `just web` runs the app in your browser.
- `just desktop` runs the native app with its own development identity.
- `just desktop me` runs it as the account in your installed Buzz. The first
  time, macOS asks for Keychain access; choose **Always Allow**.

To use your real account in `just web`, sign in to Buzz on this computer, then
put that account's **public** key in `.env.local` at the repository root. Never
put a private key there.

```dotenv
BUZZ_DEV_VIEWER=npub1...
BUZZ_RELAY_URL=wss://your-community-relay   # optional default community
```

Each worktree gets its own port, so you can run several copies at once.
`just --list` shows the other commands.

## Find your way around

| Path | What's there |
| --- | --- |
| `src/` | The app: UI and feature logic shared by desktop and web |
| `src/features/` | One folder per feature area |
| `src-tauri/` | The native desktop host, in Rust |
| `browser-host/` | The local server that the web build uses in development |
| `crates/` | Shared Rust code, including the plugin manager |
| `tests/browser/` | Whole-app Playwright journeys |
| `docs/` | Design notes and reference |

## Make a change

- Keep each PR to one change, and open it as a draft.
- Sign off every commit with `git commit --signoff`. The DCO check fails
  without it.
- If a new feature fits the [plugin API](docs/plugin-authoring-guide.md),
  build it as a plugin in [buzz-plugins](https://github.com/block/buzz-plugins)
  first. Adding a plugin to this repository needs a core maintainer's agreement.
- This repository is public, and every feature must work for any community.
  Don't commit anything specific to one company, such as internal hosts, links
  or org names. Put that in a private plugin.
- If your change affects how people use the app, update the
  [help guide](docs/buzz-help.md). Agents read it to answer questions.

## Test it

Write tests for behavior a user or another system would notice breaking. Don't
write tests for implementation details or for how the UI looks.

- **Unit and component tests** sit next to the code they test:
  `pnpm exec vitest run <path>`.
- **Browser journeys** are in `tests/browser/`. Install the browsers once with
  `pnpm test:browser:install`, then run one file with `pnpm test:browser <file>`.
- **The git hooks** format and lint your staged files on commit. On push, they
  type-check and run the unit tests related to what you changed.
- **CI** runs everything on every PR, so you don't need to run the full suite
  yourself.

## Get it reviewed

Try the change in the app yourself before you ask for review. When CI is green
and you're happy with it, mark the PR ready for review. Visual changes in the app
should include a screenshot, and bigger behavioral changes a video!

## More detail

- [AGENTS.md](AGENTS.md)
- [Browser testing](docs/browser-testing.md)
- [Plugin architecture](docs/plugin-architecture.md)
- [Desktop releases](docs/releases.md)

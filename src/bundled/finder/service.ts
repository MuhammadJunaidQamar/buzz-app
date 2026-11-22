// `ctx.finder`: other plugins open Finder on a list, or add lists of their
// own. Finder provides it while it's on; take it with
// `ctx.inject(["finder"], (child) => …)` so a plugin still starts without it.
import { type Context, Service } from "@deepseek-ai/cordis";
import type { ChatCircleIcon } from "../../shared/design-system/icons/index";
import { createContributions } from "../../plugins/contributions";

/** One row in a list. */
export type FinderItem = Readonly<{
  /** Unique within the list. */
  id: string;
  /** What's shown and matched. */
  label: string;
  /** A second line, such as where it is. */
  detail?: string;
  /** Matched too, but not shown, such as a handle. */
  keywords?: string;
  icon?: typeof ChatCircleIcon;
  /** A round avatar in place of the icon: the image, else the label's
   * initials. */
  avatar?: Readonly<{ src?: string | undefined }>;
  /** Shown beside the list while the row is highlighted. */
  preview?:
    | Readonly<{ kind: "channel"; channelId: string }>
    | Readonly<{ kind: "person"; pubkey: string }>;
  /** Runs on Enter or click, after Finder closes. */
  run(): void;
}>;

export type FinderSource = Readonly<{
  /** Unique within your plugin; Finder prefixes your plugin's ID. */
  id: string;
  /** Names the list, in the scope chip. */
  title: string;
  /** Every row; Finder ranks them as you type. It reads them again for each
   * text and as messages and names arrive. */
  items(): readonly FinderItem[];
}>;

export type Finder = {
  /** Adds a list; returns a function that removes it. It also goes when
   * your plugin stops. */
  registerSource(source: FinderSource): () => void;
  /** Opens Finder with an empty field on a list key, such as
   * "buzz.finder/people" or "your.plugin/id"; without one, or with an
   * unknown one, as ⌘P does. */
  open(source?: string): void;
};

/** A source under its full key, such as "your.plugin/id". */
export type RegisteredSource = FinderSource & Readonly<{ key: string }>;

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Present while the Finder plugin is on. */
    finder?: Finder;
  }
}

/** Provides `ctx.finder` for as long as `ctx` (Finder's own scope) lives. */
export function provideFinder(
  ctx: Context,
  open: (source: string | undefined) => void,
) {
  const sources = createContributions<FinderSource>(ctx);
  class FinderService extends Service implements Finder {
    constructor() {
      super(ctx, "finder");
    }
    // Methods, so Cordis supplies the caller's context for the source's
    // owner and lifetime.
    registerSource(source: FinderSource) {
      return sources.register(this.ctx, source);
    }
    open(source?: string) {
      open(source);
    }
  }
  new FinderService();
  return sources;
}

/** A note on a range of lines in one file of a changeset. */
export type LineComment = {
  id: string;
  path: string;
  /** The changes it covers, by react-diff-view change key. */
  keys: string[];
  /** Where it points, such as "lines 12-14" or "removed line 3". */
  lines: string;
  /** The covered diff lines, with their +, - or space marker. */
  code: string[];
  text: string;
};

/** A composer that can take the comments as a draft. */
type Composer = {
  channelId: string;
  thread: string | undefined;
  insert(text: string): boolean;
};

/** Code lines quoted per comment; the agent can read the rest. */
const QUOTED = 6;

/** Unsent comments by changeset, kept while Buzz runs so closing the panel
 * or switching files keeps them, and the chat composers they can go to. */
export function createComments() {
  const drafts = new Map<string, readonly LineComment[]>();
  const composers = new Set<Composer>();
  const listeners = new Set<() => void>();
  let next = 0;
  const set = (key: string, list: readonly LineComment[]) => {
    if (list.length) drafts.set(key, list);
    else drafts.delete(key);
    for (const listener of listeners) listener();
  };
  const NONE: readonly LineComment[] = [];
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    list: (key: string) => drafts.get(key) ?? NONE,
    add(key: string, comment: Omit<LineComment, "id">) {
      set(key, [...(drafts.get(key) ?? []), { ...comment, id: `${next++}` }]);
    },
    remove(key: string, id: string) {
      set(
        key,
        (drafts.get(key) ?? []).filter((comment) => comment.id !== id),
      );
    },
    clear: (key: string) => set(key, []),
    /** A composer offers itself while mounted; returns its release. */
    attach(composer: Composer) {
      composers.add(composer);
      return () => void composers.delete(composer);
    },
    /** Puts `text` in the conversation's composer; false when none is open. */
    deliver(channelId: string, thread: string | undefined, text: string) {
      for (const composer of composers)
        if (
          composer.channelId === channelId &&
          composer.thread === thread &&
          composer.insert(text)
        )
          return true;
      return false;
    },
  };
}
export type Comments = ReturnType<typeof createComments>;

/** The prompt the comments become: where each points, the code it covers
 * and what it says. */
export function formatComments(
  dir: string,
  comments: readonly LineComment[],
): string {
  // A fence longer than any backtick run in the code it quotes.
  const longest = Math.max(
    2,
    ...comments.flatMap((comment) =>
      comment.code.flatMap((line) =>
        (line.match(/`+/g) ?? []).map((run) => run.length),
      ),
    ),
  );
  const fence = "`".repeat(longest + 1);
  return [
    `Comments on the changes in \`${dir}\`:`,
    ...comments.map((comment) => {
      const quoted = comment.code.slice(0, QUOTED);
      if (comment.code.length > QUOTED) quoted.push(" …");
      return [
        `\`${comment.path}\` ${comment.lines}:`,
        `${fence}diff`,
        ...quoted,
        fence,
        comment.text.trim(),
      ].join("\n");
    }),
  ].join("\n\n");
}

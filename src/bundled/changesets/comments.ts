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

/** Code lines quoted per comment; the agent can read the rest. */
const QUOTED = 6;

/** Comments sent from each changeset, kept while Buzz runs so its diff
 * still shows them after closing the panel or switching files. */
export function createComments() {
  const sent = new Map<string, readonly LineComment[]>();
  const listeners = new Set<() => void>();
  let next = 0;
  const NONE: readonly LineComment[] = [];
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    list: (key: string) => sent.get(key) ?? NONE,
    add(key: string, comment: Omit<LineComment, "id">) {
      sent.set(key, [
        ...(sent.get(key) ?? []),
        { ...comment, id: `${next++}` },
      ]);
      for (const listener of listeners) listener();
    },
  };
}
export type Comments = ReturnType<typeof createComments>;

/** The message a comment becomes: where it points, the code it covers and
 * what it says. */
export function formatComment(
  dir: string,
  comment: Omit<LineComment, "id">,
): string {
  // A fence longer than any backtick run in the code it quotes.
  const longest = Math.max(
    2,
    ...comment.code.flatMap((line) =>
      (line.match(/`+/g) ?? []).map((run) => run.length),
    ),
  );
  const fence = "`".repeat(longest + 1);
  const quoted = comment.code.slice(0, QUOTED);
  if (comment.code.length > QUOTED) quoted.push(" …");
  return [
    `Comment on \`${comment.path}\` ${comment.lines}, in \`${dir}\`:`,
    `${fence}diff`,
    ...quoted,
    fence,
    comment.text.trim(),
  ].join("\n");
}

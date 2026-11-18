import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ChangeData,
  type FileData,
  type GutterOptions,
  computeNewLineNumber,
  computeOldLineNumber,
  getChangeKey,
} from "react-diff-view";
import { ChatCircleIcon } from "../../shared/design-system/icons";
import { Button } from "../../shared/design-system/ui/Button";
import { Field } from "../../shared/design-system/ui/Field";
import { Textarea } from "../../shared/design-system/ui/Textarea";
import { DiffViewer } from "../diffs/DiffViewer";
import type { Comments, LineComment } from "./comments";
import styles from "./Changesets.module.css";

/** Where `changes` sit: in the file as it is now, or, when they were all
 * removed, as it was. */
export function describeLines(changes: readonly ChangeData[]): string {
  const now = changes.map(computeNewLineNumber).filter((line) => line > 0);
  const numbers = now.length
    ? now
    : changes.map(computeOldLineNumber).filter((line) => line > 0);
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  const span = low === high ? `line ${low}` : `lines ${low}-${high}`;
  return now.length ? span : `removed ${span}`;
}
const marker = (change: ChangeData) =>
  change.type === "insert" ? "+" : change.type === "delete" ? "-" : " ";

/** One file's diff whose lines take comments: choose a line number, or
 * Shift-choose another to cover the lines between. Each comment goes to the
 * agent as soon as it is made. */
export function CommentableDiff({
  content,
  files,
  path,
  comments,
  draft,
  send,
}: {
  content: string;
  files: FileData[] | undefined;
  path: string;
  comments: Comments;
  /** The changeset the comments belong to. */
  draft: string;
  /** Sends a comment to the agent; throws with the reason it could not. */
  send(comment: Omit<LineComment, "id">): void;
}) {
  const saved = useSyncExternalStore(comments.subscribe, () =>
    comments.list(draft),
  );
  const changes = useMemo(
    () => files?.flatMap((file) => file.hunks.flatMap((hunk) => hunk.changes)),
    [files],
  );
  const [pick, setPick] = useState<{ from: number; to: number }>();
  // What the open field holds, kept here so moving it to a wider range keeps
  // it without each keystroke rendering the diff again.
  const typed = useRef("");
  // The line number that opened the field, which takes focus back.
  const opener = useRef<HTMLButtonElement | null>(null);
  const [failure, setFailure] = useState<string>();
  // The one line number in the Tab order; arrow keys move it.
  const [stop, setStop] = useState<string>();
  if (!files || !changes?.length)
    return <DiffViewer content={content} files={files} filePath={path} />;
  const low = pick && Math.min(pick.from, pick.to);
  const high = pick && Math.max(pick.from, pick.to);
  const picked =
    low === undefined || high === undefined ? [] : changes.slice(low, high + 1);
  const choose = (
    change: ChangeData,
    from: HTMLButtonElement,
    extend: boolean,
  ) => {
    const at = changes.indexOf(change);
    if (at < 0) return;
    opener.current = from;
    setFailure(undefined);
    setPick(
      extend && pick ? { from: pick.from, to: at } : { from: at, to: at },
    );
  };
  const cancel = () => {
    setPick(undefined);
    setFailure(undefined);
    typed.current = "";
    opener.current?.focus();
  };
  const add = () => {
    const text = typed.current;
    if (!picked.length || !text.trim()) return;
    const comment = {
      path,
      keys: picked.map(getChangeKey),
      lines: describeLines(picked),
      code: picked.map((change) => `${marker(change)}${change.content}`),
      text: text.trim(),
    };
    try {
      send(comment);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Couldn't send the comment.",
      );
      return;
    }
    comments.add(draft, comment);
    cancel();
  };
  const widgets: Record<string, ReactNode[]> = {};
  const place = (key: string, row: ReactNode) => {
    widgets[key] = [...(widgets[key] ?? []), row];
  };
  for (const comment of saved) {
    const key = comment.path === path ? comment.keys.at(-1) : undefined;
    if (key) place(key, <SentComment key={comment.id} comment={comment} />);
  }
  const anchor = picked.at(-1);
  if (anchor)
    place(
      getChangeKey(anchor),
      <NewComment
        key="new"
        label={`Comment on ${describeLines(picked)}`}
        typed={typed}
        failure={failure}
        cancel={cancel}
        add={add}
      />,
    );
  const first = changes[0];
  const tabStop = stop ?? (first && getChangeKey(first));
  const renderGutter = ({ change, side, renderDefault }: GutterOptions) => {
    // One target per row: removed lines by their old number, the rest by
    // their number now.
    const own = change.type === "delete" ? side === "old" : side === "new";
    const line = own
      ? side === "old"
        ? computeOldLineNumber(change)
        : computeNewLineNumber(change)
      : -1;
    if (line < 0) return renderDefault();
    const key = getChangeKey(change);
    return (
      <button
        type="button"
        className={styles.line}
        data-change={key}
        tabIndex={key === tabStop ? 0 : -1}
        onFocus={() => setStop(key)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            choose(change, event.currentTarget, true);
            return;
          }
          const lines = [
            ...(event.currentTarget
              .closest("table")
              ?.querySelectorAll<HTMLButtonElement>("button[data-change]") ??
              []),
          ];
          const at = lines.indexOf(event.currentTarget);
          const to =
            event.key === "ArrowDown"
              ? lines[at + 1]
              : event.key === "ArrowUp"
                ? lines[at - 1]
                : event.key === "Home"
                  ? lines[0]
                  : event.key === "End"
                    ? lines.at(-1)
                    : undefined;
          if (!to) return;
          event.preventDefault();
          to.focus();
        }}
        aria-label={`Comment on ${change.type === "delete" ? "removed " : ""}line ${line}`}
        title="Comment. Shift-click another line, or use the arrow keys and Shift+Enter, to cover a range."
        onClick={(event) => choose(change, event.currentTarget, event.shiftKey)}
      >
        <ChatCircleIcon
          className={styles.lineIcon}
          size="0.875rem"
          aria-hidden="true"
        />
        {renderDefault()}
      </button>
    );
  };
  return (
    <DiffViewer
      content={content}
      files={files}
      filePath={path}
      annotate={{
        widgets: Object.fromEntries(
          Object.entries(widgets).map(([key, rows]) => [
            key,
            <div key={key} className={styles.thread}>
              {rows}
            </div>,
          ]),
        ),
        selectedChanges: picked.map(getChangeKey),
        renderGutter,
      }}
    />
  );
}

function NewComment({
  label,
  typed,
  failure,
  cancel,
  add,
}: {
  label: string;
  typed: { current: string };
  failure: string | undefined;
  cancel(): void;
  add(): void;
}) {
  const [empty, setEmpty] = useState(!typed.current.trim());
  return (
    <form
      className={styles.card}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add();
      }}
    >
      <Field label={label} error={failure}>
        <Textarea
          autoFocus
          rows={3}
          defaultValue={typed.current}
          placeholder="What should the agent change?"
          onChange={(event) => {
            typed.current = event.target.value;
            setEmpty(!typed.current.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              cancel();
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              add();
            }
          }}
        />
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={empty}>
          Send
        </Button>
      </div>
    </form>
  );
}

function SentComment({ comment }: { comment: LineComment }) {
  return (
    <section className={styles.card} aria-label={`Comment on ${comment.lines}`}>
      <span className={styles.note}>{comment.lines}</span>
      <p className={styles.commentText}>{comment.text}</p>
    </section>
  );
}

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
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
import type { ComposerToolProps } from "../../features/conversation/contracts";
import { TrashIcon } from "../../shared/design-system/icons";
import { Button } from "../../shared/design-system/ui/Button";
import { Field } from "../../shared/design-system/ui/Field";
import { IconButton } from "../../shared/design-system/ui/IconButton";
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
 * Shift-choose another to cover the lines between. */
export function CommentableDiff({
  content,
  files,
  path,
  comments,
  draft,
}: {
  content: string;
  files: FileData[] | undefined;
  path: string;
  comments: Comments;
  /** The changeset the comments belong to. */
  draft: string;
}) {
  const saved = useSyncExternalStore(comments.subscribe, () =>
    comments.list(draft),
  );
  const changes = useMemo(
    () => files?.flatMap((file) => file.hunks.flatMap((hunk) => hunk.changes)),
    [files],
  );
  const [pick, setPick] = useState<{ from: number; to: number }>();
  const [text, setText] = useState("");
  if (!files || !changes?.length)
    return <DiffViewer content={content} files={files} filePath={path} />;
  const low = pick && Math.min(pick.from, pick.to);
  const high = pick && Math.max(pick.from, pick.to);
  const picked =
    low === undefined || high === undefined ? [] : changes.slice(low, high + 1);
  const choose = (change: ChangeData, extend: boolean) => {
    const at = changes.indexOf(change);
    if (at < 0) return;
    setPick(
      extend && pick ? { from: pick.from, to: at } : { from: at, to: at },
    );
  };
  const cancel = () => {
    setPick(undefined);
    setText("");
  };
  const add = () => {
    if (!picked.length || !text.trim()) return;
    comments.add(draft, {
      path,
      keys: picked.map(getChangeKey),
      lines: describeLines(picked),
      code: picked.map((change) => `${marker(change)}${change.content}`),
      text: text.trim(),
    });
    cancel();
  };
  const widgets: Record<string, ReactNode[]> = {};
  const place = (key: string, row: ReactNode) => {
    widgets[key] = [...(widgets[key] ?? []), row];
  };
  for (const comment of saved) {
    const key = comment.path === path ? comment.keys.at(-1) : undefined;
    if (key)
      place(
        key,
        <SavedComment
          key={comment.id}
          comment={comment}
          remove={() => comments.remove(draft, comment.id)}
        />,
      );
  }
  const anchor = picked.at(-1);
  if (anchor)
    place(
      getChangeKey(anchor),
      <form
        key="new"
        className={styles.comment}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          add();
        }}
      >
        <Field label={`Comment on ${describeLines(picked)}`}>
          <Textarea
            autoFocus
            rows={3}
            value={text}
            placeholder="What should the agent change?"
            onChange={(event) => setText(event.target.value)}
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
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={!text.trim()}
          >
            Comment
          </Button>
        </div>
      </form>,
    );
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
    return (
      <button
        type="button"
        className={styles.line}
        aria-label={`Comment on ${change.type === "delete" ? "removed " : ""}line ${line}`}
        title="Comment. Shift-click another line to cover a range."
        onClick={(event) => choose(change, event.shiftKey)}
      >
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

function SavedComment({
  comment,
  remove,
}: {
  comment: LineComment;
  remove(): void;
}) {
  return (
    <section
      className={styles.comment}
      aria-label={`Comment on ${comment.lines}`}
    >
      <div className={styles.commentHead}>
        <span className={styles.note}>{comment.lines}</span>
        <IconButton
          aria-label="Remove comment"
          icon={<TrashIcon size={16} aria-hidden="true" />}
          onClick={remove}
        />
      </div>
      <p className={styles.commentText}>{comment.text}</p>
    </section>
  );
}

/** Renders nothing: while a conversation's composer is open, it can take the
 * comments its changesets send. */
export function ComposerBridge({
  comments,
  channelId,
  threadRootId,
  insertText,
  focus,
}: ComposerToolProps & { comments: Comments }) {
  useEffect(
    () =>
      comments.attach({
        channelId,
        thread: threadRootId,
        insert(text) {
          if (!insertText(text)) return false;
          focus();
          return true;
        },
      }),
    [comments, channelId, threadRootId, insertText, focus],
  );
  return null;
}

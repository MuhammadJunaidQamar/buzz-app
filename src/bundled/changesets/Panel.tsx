import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PanelProps } from "../../features/panels/service";
import {
  CaretLeftIcon,
  CaretRightIcon,
} from "../../shared/design-system/icons";
import { Button } from "../../shared/design-system/ui/Button";
import { InlineHeader } from "../../shared/design-system/ui/Header";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { LoadingRegion } from "../../shared/design-system/ui/LoadingRegion";
import { Select } from "../../shared/design-system/ui/Select";
import { parsePatch } from "../diffs/parse";
import { type Comments, formatComments } from "./comments";
import { CommentableDiff } from "./LineComments";
import type { ChangedFile } from "./git";
import { parseTarget } from "./target";
import type { Turns } from "./turns";
import { Counts, plural, totals } from "./Counts";
import styles from "./Changesets.module.css";
import { useLoaded } from "./useLoaded";

/** A recorded turn's checkout: its files, one diff at a time. */
export function ChangesetPanel({
  target,
  turns,
  comments,
}: Pick<PanelProps, "target"> & { turns: Turns; comments: Comments }) {
  const link = useMemo(() => parseTarget(target), [target]);
  const found = link && turns.find(link.turn, link.checkout);
  const draft = link ? `${link.turn}:${link.checkout}` : "";
  const unsent = useSyncExternalStore(comments.subscribe, () =>
    comments.list(draft),
  );
  const [undelivered, setUndelivered] = useState(false);
  const [chosen, setChosen] = useState(link?.file);
  useEffect(() => setChosen(link?.file), [link?.file]);
  const listed = useLoaded(
    link ? () => turns.summary(link.turn, link.checkout) : undefined,
    [turns, link],
  );
  const files = listed.value;
  const index = files
    ? Math.max(
        0,
        files.findIndex((each) => each.path === chosen),
      )
    : 0;
  const file = files?.[index];
  const patch = useLoaded(
    link && file && !file.binary
      ? () => turns.patch(link.turn, link.checkout, file)
      : undefined,
    [turns, link, file],
  );
  const parsed = useMemo(
    () => (patch.value === undefined ? undefined : parsePatch(patch.value)),
    [patch.value],
  );
  if (!link || !found)
    return <p role="alert">This changeset was recorded in another Buzz.</p>;
  const pending = listed.error === undefined && !files;
  const step = (by: number) => files && setChosen(files[index + by]?.path);
  const send = () => {
    const sent = comments.deliver(
      found.turn.channelId,
      found.turn.thread,
      formatComments(found.checkout.dir, unsent),
    );
    setUndelivered(!sent);
    if (sent) comments.clear(draft);
  };
  return (
    <div className={styles.panel}>
      <InlineHeader
        level={3}
        title={found.checkout.label}
        subtitle={
          files ? (
            <>
              {plural(files.length, "file")} changed{" "}
              <Counts {...totals(files)} />
            </>
          ) : undefined
        }
      />
      {unsent.length > 0 && (
        <div className={styles.unsent}>
          <p className="text-body-sm">{plural(unsent.length, "comment")}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setUndelivered(false);
              comments.clear(draft);
            }}
          >
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={send}>
            Add to message
          </Button>
          {undelivered && (
            <p role="alert" className={styles.note}>
              Open this chat to add the comments to your message.
            </p>
          )}
        </div>
      )}
      <LoadingRegion
        pending={pending}
        label="Reading the changes…"
        statusVisibility="screen-reader"
        feedback={
          listed.error !== undefined ? (
            <div role="alert">
              <p>Couldn't read this changeset. {listed.error}</p>
              {listed.retry && (
                <Button size="sm" variant="ghost" onClick={listed.retry}>
                  Try again
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {files && file && (
          <>
            {files.length > 1 && (
              <div className={styles.picker}>
                <Select
                  label="File"
                  variant="compact"
                  value={file.path}
                  onValueChange={setChosen}
                  groups={[
                    {
                      label: "Changed files",
                      options: files.map((each) => ({
                        value: each.path,
                        label: each.path,
                      })),
                    },
                  ]}
                />
                <IconButton
                  aria-label="Previous file"
                  icon={<CaretLeftIcon size={16} aria-hidden="true" />}
                  disabled={index === 0}
                  onClick={() => step(-1)}
                />
                <IconButton
                  aria-label="Next file"
                  icon={<CaretRightIcon size={16} aria-hidden="true" />}
                  disabled={index === files.length - 1}
                  onClick={() => step(1)}
                />
              </div>
            )}
            <FileDiff
              key={file.path}
              file={file}
              patch={patch}
              parsed={parsed}
              comments={comments}
              draft={draft}
            />
          </>
        )}
      </LoadingRegion>
    </div>
  );
}

function FileDiff({
  file,
  patch,
  parsed,
  comments,
  draft,
}: {
  file: ChangedFile;
  patch: {
    value?: string | undefined;
    error?: string | undefined;
    retry?: (() => void) | undefined;
  };
  parsed: ReturnType<typeof parsePatch>;
  comments: Comments;
  draft: string;
}) {
  if (file.binary)
    return <p className="text-body-sm">Binary file: no text diff to show.</p>;
  if (patch.error !== undefined)
    return (
      <div role="alert">
        <p className="text-body-sm">{patch.error}</p>
        {patch.retry && (
          <Button size="sm" variant="ghost" onClick={patch.retry}>
            Try again
          </Button>
        )}
      </div>
    );
  if (patch.value === undefined)
    return <p className="text-body-sm">Reading {file.path}…</p>;
  return (
    <CommentableDiff
      content={patch.value}
      files={parsed}
      path={file.path}
      comments={comments}
      draft={draft}
    />
  );
}

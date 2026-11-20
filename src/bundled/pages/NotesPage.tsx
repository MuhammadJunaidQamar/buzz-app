import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { noteKey, noteUrl, type Note } from "./model";
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  Filter2Icon,
  InfoIcon,
  NoteIcon,
  PlusIcon,
} from "../../shared/design-system/icons";
import { NavigationItem } from "../../shared/design-system/ui/NavigationItem";
import { Button } from "../../shared/design-system/ui/Button";
import { EmptyState } from "../../shared/design-system/ui/EmptyState";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { LoadingRegion } from "../../shared/design-system/ui/LoadingRegion";
import { Panel } from "../../shared/design-system/ui/Panel";
import {
  PanelHeader,
  PanelHeaderLabel,
} from "../../shared/design-system/ui/PanelHeader";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPopup,
  PopoverTitle,
  PopoverDescription,
} from "../../shared/design-system/ui/Popover";
import { SearchField } from "../../shared/design-system/ui/SearchField";
import { TypingDots } from "../../shared/design-system/ui/TypingDots";
import {
  MenuRoot,
  MenuTrigger,
  MenuPopup,
  MenuCheckboxItem,
} from "../../shared/design-system/ui/Menu";
import { NoteAuthor, NoteTime } from "./NoteMetadata";
import styles from "./NotesPage.module.css";

export type NotesPageProps = {
  community: string;
  entries: readonly Note[];
  author(note: Note): Parameters<typeof NoteAuthor>[0];
  items: readonly { id: string; label: string; content: ReactNode }[];
  selected: string;
  query: string;
  trash: boolean;
  canFilter: boolean;
  searchRef: RefObject<HTMLElement | null>;
  loading: boolean;
  more: boolean;
  error: string;
  search(query: string, commit?: boolean): void;
  showDeleted(value: boolean): void;
  create(): void;
  refresh(): void;
  loadMore(): void;
  open(note: Note): void;
  browse(): void;
};

/** The workspace owns discovery, access, drafts and navigation. This page renders its documents. */
export function NotesPage({
  community,
  entries,
  author,
  items,
  selected,
  query,
  trash,
  canFilter,
  searchRef,
  loading,
  more,
  error,
  search,
  showDeleted,
  create,
  refresh,
  loadMore,
  open,
  browse,
}: NotesPageProps) {
  const backRef = useRef<HTMLButtonElement>(null);
  const reading = selected !== "browse";
  useEffect(() => {
    if (selected !== "browse" && !selected.startsWith("new:"))
      backRef.current?.focus();
  }, [selected]);
  const match = query.toLowerCase();
  const visible = entries
    .filter((note) =>
      `${note.title}\n${note.markdown}\n${note.event.pubkey}`
        .toLowerCase()
        .includes(match),
    )
    .sort(
      (a, b) =>
        b.event.created_at - a.event.created_at ||
        a.event.id.localeCompare(b.event.id),
    );
  const empty = !loading && !error && !entries.length && !query;
  const active = items.find((item) => item.id === selected);
  const titleLink = (note: Note) => (
    <li key={noteKey(note)}>
      <NavigationItem
        nativeButton={false}
        role="link"
        aria-label={note.title}
        aria-description={`Last edited by ${author(note).name}`}
        render={<a href={noteUrl(note, community)} />}
        label={<span className="text-label">{note.title}</span>}
        icon={<NoteIcon size={20} className="text-subtle" aria-hidden="true" />}
        trailing={
          <span className={`${styles.rowMetadata} text-caption text-subtle`}>
            <span title={`Last edited by ${author(note).name}`}>
              <NoteAuthor {...author(note)} avatarOnly />
            </span>
            <NoteTime note={note.event} />
          </span>
        }
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          open(note);
        }}
      />
    </li>
  );
  return (
    <div className={styles.page}>
      <div className={styles.collection} hidden={reading}>
        <Panel aria-label="Docs">
          <div className={styles.page}>
            <PanelHeader
              title={
                <PanelHeaderLabel title="Docs" icon={<NoteIcon size={16} />}>
                  <PopoverRoot>
                    <PopoverTrigger
                      render={
                        <IconButton
                          aria-label="About docs"
                          title="About docs"
                          icon={<InfoIcon size={16} />}
                        />
                      }
                    />
                    <PopoverPopup>
                      <PopoverTitle>About Docs</PopoverTitle>
                      <PopoverDescription
                        render={<div className={styles.description} />}
                      >
                        <p>
                          Create docs with people and agents. Open a title to
                          read or edit the doc, then use Back to docs to return
                          to the list.
                        </p>
                        <p>
                          Each doc has its own sharing settings. Access includes
                          retained revisions. The relay operator can read doc
                          contents. Don’t include secrets.
                        </p>
                      </PopoverDescription>
                    </PopoverPopup>
                  </PopoverRoot>
                </PanelHeaderLabel>
              }
              actions={
                <IconButton
                  aria-label="Refresh docs"
                  title="Refresh docs"
                  icon={<ArrowsClockwiseIcon size={16} />}
                  aria-busy={loading}
                  disabled={loading}
                  onClick={refresh}
                />
              }
            />
            <div className={styles.body}>
              <SearchField
                variant="capsule"
                inputRef={searchRef}
                label="Search docs"
                disabled={!entries.length && !query}
                placeholder="Search"
                value={query}
                onValueChange={(value) => search(value)}
                onBlur={() => search(query, true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search(query, true);
                }}
                trailing={
                  <MenuRoot>
                    <MenuTrigger
                      disabled={!canFilter}
                      render={
                        <IconButton
                          aria-label="Filter docs"
                          title="Filter docs"
                          variant={trash ? "prominent" : "ghost"}
                          icon={<Filter2Icon size={16} aria-hidden="true" />}
                        />
                      }
                    />
                    <MenuPopup align="end">
                      <MenuCheckboxItem
                        checked={trash}
                        onCheckedChange={showDeleted}
                        closeOnClick
                      >
                        Show deleted docs
                      </MenuCheckboxItem>
                    </MenuPopup>
                  </MenuRoot>
                }
              />
              {error && (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="m-0">
                    {error}
                  </p>
                  <Button size="sm" variant="subtle" onClick={refresh}>
                    Try again
                  </Button>
                </div>
              )}
              <LoadingRegion
                pending={loading}
                statusVisibility={
                  loading && !entries.length ? "visible" : "screen-reader"
                }
                label={
                  <span className="inline-flex items-center gap-2">
                    <TypingDots size="small" />
                    Loading docs…
                  </span>
                }
              >
                {empty ? (
                  <EmptyState
                    icon={null}
                    title="No docs yet"
                    description="Create a doc or ask an agent to save one."
                    action={
                      <Button variant="subtle" onClick={create}>
                        <PlusIcon size={16} aria-hidden="true" />
                        New doc
                      </Button>
                    }
                  />
                ) : (
                  <ul className={styles.titleList} aria-label="Docs">
                    {visible.map(titleLink)}
                    <li key="new-page">
                      <NavigationItem
                        variant="text"
                        icon={<PlusIcon size={16} aria-hidden="true" />}
                        label="New doc"
                        onClick={create}
                      />
                    </li>
                  </ul>
                )}
              </LoadingRegion>
              {!loading && !error && query && !visible.length && (
                <p role="status">No matching docs.</p>
              )}
              {more && (
                <div>
                  <Button size="sm" loading={loading} onClick={loadMore}>
                    Load more docs
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
      <div className={styles.fullView} hidden={!reading}>
        <Panel aria-label="Doc details">
          <PanelHeader
            title={
              <PanelHeaderLabel
                title={active?.label ?? "Doc"}
                icon={<NoteIcon size={16} />}
              />
            }
            navigation={
              <IconButton
                ref={backRef}
                aria-label="Back to docs"
                title="Back to docs"
                icon={<ArrowLeftIcon size={16} />}
                onClick={browse}
              />
            }
          />
          {items.map((item) => (
            <div
              key={item.id}
              className={styles.noteView}
              hidden={item.id !== selected}
            >
              {item.content}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

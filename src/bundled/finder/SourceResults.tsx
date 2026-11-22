import { type ReactNode, type RefObject, useMemo } from "react";
import {
  SearchChoices,
  type SearchDestination,
} from "../../app/shell/SearchChoices";
import {
  type PreviewCache,
  SearchPreview,
} from "../../app/shell/SearchPreview";
import type { RelaySession } from "../../features/relay/session";
import { ChatCircleIcon } from "../../shared/design-system/icons/index";
import { createCorpus } from "./corpus.ts";
import type { RegisteredSource } from "./service";

const LIMIT = 50;

/** The best rows for the text, ranked by Finder's matcher over label and
 * keywords, with their matched code points; ties keep the source's order.
 * `undefined` when the list fails. */
function useRanked(source: RegisteredSource, query: string, revision: number) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: new text, names or messages read the list again, so it stays current.
  const items = useMemo(() => {
    try {
      return source.items();
    } catch (error) {
      console.error(`Finder source ${source.key} failed`, error);
      return undefined;
    }
  }, [source, query, revision]);
  const corpus = useMemo(() => {
    const ranked = createCorpus();
    ranked.add(
      (items ?? []).map((item, n, all) => ({
        id: item.id,
        channelId: "",
        authorId: "",
        // Newer wins a tie; the first row is "newest".
        createdAt: all.length - n,
        author: item.keywords ?? "",
        place: "",
        text: item.label,
      })),
    );
    return ranked;
  }, [items]);
  if (!items) return undefined;
  const byId = new Map(items.map((item) => [item.id, item]));
  const results = corpus.search(query, LIMIT);
  return {
    total: results.total,
    hits: results.hits.flatMap(({ doc, positions }) => {
      const item = byId.get(doc.id);
      return item ? [{ item, positions }] : [];
    }),
  };
}

export function SourceResults({
  source,
  query,
  revision,
  setQuery,
  input,
  open,
  session,
  onOpenChange,
  onClose,
  footer,
}: {
  source: RegisteredSource;
  query: string;
  /** Moves as names, channels and messages arrive. */
  revision: number;
  setQuery: (query: string) => void;
  input: RefObject<HTMLElement | null>;
  open: boolean;
  session: RelaySession | undefined;
  onOpenChange: (open: boolean) => void;
  /** Leaves this source for All of Buzz. */
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ranked = useRanked(source, query, revision);
  // biome-ignore lint/correctness/useExhaustiveDependencies: previews must not cross sessions.
  const previews = useMemo<PreviewCache>(() => new Map(), [session]);
  const rows = (ranked?.hits ?? []).map(
    ({ item, positions }): SearchDestination => ({
      key: `item:${item.id}`,
      label: item.label,
      ...(positions.length ? { matches: positions } : {}),
      ...(item.detail ? { detail: item.detail } : {}),
      icon: item.icon ?? ChatCircleIcon,
      ...(item.avatar && {
        avatar: {
          shape: "circle",
          ...(item.avatar.src && { src: item.avatar.src }),
        },
      }),
      ...(item.preview && { peek: item.preview }),
      run: () => {
        onOpenChange(false);
        try {
          item.run();
        } catch (error) {
          console.error(`Finder source ${source.key} failed`, error);
        }
      },
    }),
  );
  return (
    <SearchChoices
      label={source.title}
      query={query}
      onQueryChange={setQuery}
      input={input}
      open={open}
      highlightEmpty
      groups={[
        {
          label: source.title,
          hideLabel: true,
          destinations: rows,
          total: rows.length,
          count:
            ranked && ranked.total > rows.length
              ? `${rows.length} of ${ranked.total.toLocaleString()}`
              : undefined,
          empty: !ranked
            ? "This list couldn't load."
            : query.trim()
              ? "Nothing matches. Try fewer letters."
              : "This list is empty.",
        },
      ]}
      footer={footer}
      scope={{ id: source.key, label: source.title, onRemove: onClose }}
      peek={{
        ranked: false,
        busy: false,
        preview: session
          ? (row, tone, follow) => (
              <SearchPreview
                session={session}
                cache={previews}
                row={row?.peek ? row : undefined}
                tone={tone}
                follow={follow}
                terms={[]}
                nameOf={(pubkey) =>
                  session.profiles.snapshot().get(pubkey)?.name ??
                  pubkey.slice(0, 10)
                }
                whereOf={(channelId) =>
                  session.channels.get?.(channelId)?.name ?? "Conversation"
                }
              />
            )
          : undefined,
      }}
    />
  );
}

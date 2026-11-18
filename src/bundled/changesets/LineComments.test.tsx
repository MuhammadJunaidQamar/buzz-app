// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComposerToolProps } from "../../features/conversation/contracts";
import { createComments, formatComments } from "./comments";
import { ComposerBridge } from "./LineComments";
import { ChangesetPanel } from "./Panel";
import { targetFor } from "./target";
import type { Turn, Turns } from "./turns";

afterEach(cleanup);

const PATCH = [
  "diff --git a/a.txt b/a.txt",
  "index 1111111..2222222 100644",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,3 +1,3 @@",
  " keep",
  "-old",
  "+new",
  " tail",
  "",
].join("\n");
const turn: Turn = {
  id: "t1",
  agent: "A",
  channelId: "c",
  viewer: "me",
  origin: "o",
  start: 1,
  end: 2,
  checkouts: [
    {
      dir: "/work/app",
      prefix: "",
      label: "app (main)",
      before: "a".repeat(40),
      after: "b".repeat(40),
      files: 1,
    },
  ],
};
const turns = {
  subscribe: () => () => {},
  version: () => 0,
  summary: async () => [
    {
      path: "a.txt",
      status: "modified",
      additions: 1,
      deletions: 1,
      binary: false,
    },
  ],
  patch: async () => PATCH,
  find: () => ({ turn, checkout: turn.checkouts[0] }),
} as unknown as Turns;

function panel(comments = createComments()) {
  render(
    <ChangesetPanel
      target={targetFor("t1", 0, "a.txt")}
      turns={turns}
      comments={comments}
    />,
  );
  return comments;
}

async function comment(from: string, to: string | undefined, text: string) {
  fireEvent.click(await screen.findByRole("button", { name: from }));
  if (to)
    fireEvent.click(screen.getByRole("button", { name: to }), {
      shiftKey: true,
    });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Comment" }));
}

it("adds comments on a range of lines to the chat's composer as one prompt", async () => {
  const comments = panel();
  const insert = vi.fn(() => true);
  comments.attach({ channelId: "other", thread: undefined, insert });
  const here = vi.fn(() => true);
  comments.attach({ channelId: "c", thread: undefined, insert: here });
  await comment("Comment on line 1", "Comment on line 2", "Rename this");
  await comment("Comment on removed line 2", undefined, "Keep `old`");
  expect(
    screen.getByRole("region", { name: "Comment on lines 1-2" }),
  ).toHaveTextContent("Rename this");
  expect(screen.getByText("2 comments")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add to message" }));
  expect(insert).not.toHaveBeenCalled();
  expect(here).toHaveBeenCalledWith(
    [
      "Comments on the changes in `/work/app`:",
      "`a.txt` lines 1-2:\n```diff\n keep\n-old\n+new\n```\nRename this",
      "`a.txt` removed line 2:\n```diff\n-old\n```\nKeep `old`",
    ].join("\n\n"),
  );
  expect(screen.queryByText("2 comments")).toBeNull();
});

it("keeps the comments and says so when the chat's composer is not open", async () => {
  const comments = panel();
  await comment("Comment on line 2", undefined, "Why?");
  fireEvent.click(screen.getByRole("button", { name: "Add to message" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't add the comments",
  );
  expect(comments.list("t1:0")).toHaveLength(1);
});

it("cancels a comment with Escape and removes a saved one", async () => {
  panel();
  fireEvent.click(
    await screen.findByRole("button", { name: "Comment on line 3" }),
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(
    screen.getByRole("button", { name: "Comment on line 3" }),
  ).toHaveFocus();
  expect(screen.queryByRole("textbox")).toBeNull();
  await comment("Comment on line 3", undefined, "Drop it");
  const saved = screen.getByRole("region", { name: "Comment on line 3" });
  fireEvent.click(
    within(saved).getByRole("button", { name: "Remove comment" }),
  );
  expect(
    screen.queryByRole("region", { name: "Comment on line 3" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Add to message" })).toBeNull();
});

it("fences quoted code past its own backticks and shortens long quotes", () => {
  const code = ["+```js", ...Array.from({ length: 8 }, (_, i) => `+${i}`)];
  expect(
    formatComments("/w", [
      {
        id: "0",
        path: "a.md",
        keys: [],
        lines: "lines 1-9",
        code,
        text: " Hi ",
      },
    ]),
  ).toBe(
    [
      "Comments on the changes in `/w`:",
      "",
      "`a.md` lines 1-9:",
      "````diff",
      "+```js",
      "+0",
      "+1",
      "+2",
      "+3",
      "+4",
      " …",
      "````",
      "Hi",
    ].join("\n"),
  );
});

it("lets an open composer take comments until it closes", () => {
  const comments = createComments();
  const insertText = vi.fn(() => true);
  const focus = vi.fn();
  const view = render(
    <ComposerBridge
      {...({
        channelId: "c",
        insertText,
        focus,
      } as unknown as ComposerToolProps)}
      comments={comments}
    />,
  );
  expect(comments.deliver("c", undefined, "hi")).toBe(true);
  expect(insertText).toHaveBeenCalledWith("hi");
  expect(focus).toHaveBeenCalled();
  expect(comments.deliver("c", "root", "hi")).toBe(false);
  view.unmount();
  expect(comments.deliver("c", undefined, "hi")).toBe(false);
});

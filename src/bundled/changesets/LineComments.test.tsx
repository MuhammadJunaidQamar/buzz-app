// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createComments, formatComment } from "./comments";
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

function panel(send: (turn: Turn, text: string) => void = vi.fn()) {
  const comments = createComments();
  render(
    <ChangesetPanel
      target={targetFor("t1", 0, "a.txt")}
      turns={turns}
      comments={comments}
      send={send}
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
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

it("sends each comment on a range of lines to the turn's agent at once", async () => {
  const send = vi.fn();
  const comments = panel(send);
  await comment("Comment on line 1", "Comment on line 2", "Rename this");
  expect(send).toHaveBeenLastCalledWith(
    turn,
    "Comment on `a.txt` lines 1-2, in `app`:\n```diff\n keep\n-old\n+new\n```\nRename this",
  );
  expect(
    screen.getByRole("region", { name: "Comment on lines 1-2" }),
  ).toHaveTextContent("Rename this");
  expect(screen.queryByRole("textbox")).toBeNull();
  await comment("Comment on removed line 2", undefined, "Keep `old`");
  expect(send).toHaveBeenLastCalledWith(
    turn,
    "Comment on `a.txt` removed line 2, in `app`:\n```diff\n-old\n```\nKeep `old`",
  );
  expect(comments.list("t1:0")).toHaveLength(2);
});

it("keeps the comment open and says why when it can't be sent", async () => {
  const comments = panel(() => {
    throw new Error(
      "Switch to the community and account this changeset was recorded in, then try again.",
    );
  });
  await comment("Comment on line 2", undefined, "Why?");
  expect(screen.getByRole("textbox")).toHaveValue("Why?");
  expect(screen.getByText(/Switch to the community/)).toBeInTheDocument();
  expect(comments.list("t1:0")).toHaveLength(0);
});

it("cancels a comment with Escape and sends nothing", async () => {
  const send = vi.fn();
  panel(send);
  fireEvent.click(
    await screen.findByRole("button", { name: "Comment on line 3" }),
  );
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(
    screen.getByRole("button", { name: "Comment on line 3" }),
  ).toHaveFocus();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(send).not.toHaveBeenCalled();
});

it("fences quoted code past its own backticks and shortens long quotes", () => {
  const code = ["+```js", ...Array.from({ length: 8 }, (_, i) => `+${i}`)];
  expect(
    formatComment("/w", {
      path: "a.md",
      keys: [],
      lines: "lines 1-9",
      code,
      text: " Hi ",
    }),
  ).toBe(
    [
      "Comment on `a.md` lines 1-9, in `/w`:",
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

it("puts one line number in the Tab order and moves it with the arrow keys", async () => {
  panel();
  const first = await screen.findByRole("button", {
    name: "Comment on line 1",
  });
  const removed = screen.getByRole("button", {
    name: "Comment on removed line 2",
  });
  expect(first).toHaveAttribute("tabindex", "0");
  expect(removed).toHaveAttribute("tabindex", "-1");
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(removed).toHaveFocus();
  expect(removed).toHaveAttribute("tabindex", "0");
  expect(first).toHaveAttribute("tabindex", "-1");
  fireEvent.keyDown(removed, { key: "End" });
  expect(
    screen.getByRole("button", { name: "Comment on line 3" }),
  ).toHaveFocus();
});

it("extends a comment's range with Shift+Enter", async () => {
  panel();
  fireEvent.click(
    await screen.findByRole("button", { name: "Comment on line 1" }),
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Comment on line 2" }), {
    key: "Enter",
    shiftKey: true,
  });
  expect(
    screen.getByRole("textbox", { name: "Comment on lines 1-2" }),
  ).toBeInTheDocument();
});

it("keeps quoted lines short and code spans whole", () => {
  expect(
    formatComment("my`app", {
      path: "a`b.ts",
      keys: [],
      lines: "line 1",
      code: [`+${"x".repeat(400)}`],
      text: "Hi",
    }),
  ).toBe(
    [
      "Comment on `` a`b.ts `` line 1, in `` my`app ``:",
      "```diff",
      `+${"x".repeat(299)} …`,
      "```",
      "Hi",
    ].join("\n"),
  );
});

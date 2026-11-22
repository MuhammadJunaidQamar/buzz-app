// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Context } from "@deepseek-ai/cordis";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ShortcutsService } from "../../features/shortcuts/service";
import type { PluginModule } from "../../plugins/api";
import { PluginRuntime } from "../../plugins/runtime";
import type { createRelaySession } from "../../features/relay/session";
import * as finderPlugin from "./index";
import { topInterest } from "./interest";
import type { Finder, FinderItem, FinderSource } from "./service";

const viewer = "a".repeat(64);
const communityOrigin = "https://relay.example.org";
const scope = `${communityOrigin}:${viewer}`;
const contexts: Context[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  });
});
afterEach(async () => {
  cleanup();
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
  localStorage.clear();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

/** A plugin that uses `ctx.finder` the way another plugin would. */
const consumer = (register?: () => FinderSource) => {
  const used: { finder?: Finder | undefined } = {};
  const module: PluginModule = {
    apply(ctx) {
      ctx.inject(["finder"], (child) => {
        used.finder = child.finder;
        if (register) child.finder?.registerSource(register());
      });
    },
  };
  return { module, used };
};

async function mount(
  plugins: Record<string, PluginModule> = {},
  connected?: ReturnType<typeof createRelaySession>,
) {
  const ctx = new Context();
  contexts.push(ctx);
  const modules: Record<string, PluginModule> = {
    "buzz.finder": finderPlugin,
    ...plugins,
  };
  const runtime = new PluginRuntime(ctx, async (plugin) => {
    const module = modules[plugin.manifest.id];
    if (!module) throw new Error(`No module for ${plugin.manifest.id}`);
    return module;
  });
  ctx.effect(() => () => runtime.dispose());
  const listeners = new Set<() => void>();
  let entry: { id: string; target: unknown } = {
    id: "home",
    target: { kind: "home" },
  };
  // Stable between changes, as the real navigation snapshot is.
  let snapshot = { entry };
  // The real dispatcher, so typing guards apply as in the app.
  const shortcuts = new ShortcutsService(ctx, window);
  let Overlay: ComponentType = () => null;
  const relaySnapshot = connected
    ? {
        status: "ready",
        cached: false,
        generation: 1,
        scope,
        viewer,
        session: connected.session,
      }
    : { status: "connecting" };
  ctx.provide("relay", {
    snapshot: () => relaySnapshot,
    subscribe: () => () => {},
  } as never);
  const open = vi.fn(async () => ({ status: "opened" }));
  ctx.provide("navigation", {
    open,
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  } as never);
  ctx.provide("pages", {
    registerOverlay(overlay: { component: ComponentType }) {
      Overlay = overlay.component;
    },
  } as never);
  const navigate = (next: typeof entry) => {
    entry = next;
    snapshot = { entry };
    for (const listener of listeners) listener();
  };
  const enable = async (...ids: string[]) => {
    await act(() =>
      runtime.reconcile(
        ids.map((id) => ({
          manifest: { id, name: id, apiVersion: 1 as const },
          enabled: true,
          source: "bundled" as const,
          revision: "bundled",
          previous: null,
          reloadable: false,
          error: null,
        })),
      ),
    );
    await vi.waitFor(() =>
      expect(
        shortcuts.snapshot().some((entry) => entry.key === "buzz.finder/open"),
      ).toBe(true),
    );
  };
  await enable("buzz.finder", ...Object.keys(plugins));
  // Load the lazy dialog first, so its import time can't race the waits.
  await import("./FinderDialog");
  return {
    enable,
    open,
    visit: (id: string, channelId: string) =>
      navigate({
        id,
        target: {
          kind: "conversation",
          scope: { viewer, communityOrigin },
          channelId,
        },
      }),
    leave: () => navigate({ id: `home-${entry.id}`, target: { kind: "home" } }),
    notify: () => {
      for (const listener of listeners) listener();
    },
    show: () => render(<Overlay />),
  };
}

const selectedTab = async () =>
  (await screen.findByRole("tab", { selected: true })).textContent;
const rows = () =>
  screen.queryAllByRole("option").map((row) => row.textContent ?? "");
const type = (value: string) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
const item = (label: string, run = vi.fn()): FinderItem => ({
  id: label.toLowerCase(),
  label,
  run,
});

test("counts each visit to a conversation once", async () => {
  const { visit, notify } = await mount();
  visit("v1", "busy");
  // Navigation also notifies for attempts and other changes to one visit.
  notify();
  notify();
  visit("v2", "quiet");
  visit("v3", "quiet");
  expect(topInterest(scope, 5)).toEqual(["quiet", "busy"]);
});

test("⌘P searches the open conversation, else all of Buzz; ⌘⇧P switches inside Finder but leaves other text fields alone; closing returns focus there", async () => {
  const { visit, leave, show } = await mount();
  // Off Apple platforms, ⌘ is Ctrl.
  const press = (target: Element, shift = false) =>
    fireEvent.keyDown(target, {
      key: shift ? "P" : "p",
      code: "KeyP",
      ctrlKey: true,
      shiftKey: shift,
    });
  const composer = document.createElement("textarea");
  document.body.append(composer);
  visit("v1", "crew");
  show();
  // Not over another modal, but over one on its way out, such as Finder
  // itself just after Escape.
  const modal = document.createElement("div");
  modal.setAttribute("aria-modal", "true");
  document.body.append(modal);
  press(document.body);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  modal.setAttribute("data-closed", "");
  // ⌘P works while typing.
  composer.focus();
  press(composer);
  expect(await selectedTab()).toBe("This channel");
  modal.remove();
  const field = screen.getByRole("combobox");
  field.focus();
  press(field, true);
  expect(await selectedTab()).toBe("All of Buzz");
  press(field);
  expect(await selectedTab()).toBe("This channel");
  fireEvent.keyDown(field, { key: "Escape" });
  await vi.waitFor(() =>
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument(),
  );
  // Back where you were typing.
  await vi.waitFor(() => expect(composer).toHaveFocus());
  // Typing in the composer, ⌘⇧P is Spoiler's: Finder neither opens nor
  // takes the key.
  expect(press(composer, true)).toBe(true);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  leave();
  composer.blur();
  press(document.body);
  expect(await selectedTab()).toBe("All of Buzz");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  // The dialog is gone once its focus return has run.
  await vi.waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  // Opened with nothing focused, it doesn't focus the first control.
  expect(document.body).toHaveFocus();
  composer.remove();
});

test("another plugin opens its own list; Finder ranks it and Enter runs the item", async () => {
  // Like a pane jump: the item moves focus, and closing leaves it there.
  const here = document.createElement("button");
  const there = document.createElement("button");
  document.body.append(here, there);
  here.focus();
  const banana = vi.fn(() => there.focus());
  const fruit = consumer(() => ({
    id: "list",
    title: "Fruit",
    items: () => [item("Apple"), item("Banana", banana), item("Cherry")],
  }));
  // Same local ID from another plugin: no collision.
  const veg = consumer(() => ({
    id: "list",
    title: "Vegetables",
    items: () => [item("Bean")],
  }));
  const { show, visit } = await mount({
    "example.fruit": fruit.module,
    "example.veg": veg.module,
  });
  show();
  await act(async () => fruit.used.finder?.open("example.fruit/list"));
  type("ban");
  expect(await screen.findByRole("combobox")).toHaveValue("ban");
  expect(screen.getByRole("dialog", { name: "Fruit" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Remove Fruit search scope" }),
  ).toBeVisible();
  expect(rows()).toEqual([expect.stringContaining("Banana")]);
  await act(async () => screen.getByRole("option").click());
  expect(banana).toHaveBeenCalledTimes(1);
  await vi.waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(there).toHaveFocus();
  here.remove();
  there.remove();
  await act(async () => veg.used.finder?.open("example.veg/list"));
  expect(await screen.findByRole("combobox")).toHaveValue("");
  expect(rows()).toEqual([expect.stringContaining("Bean")]);
  // The two scopes by key; a bare local ID names no list, so Finder opens
  // as ⌘P does.
  act(() => visit("v1", "crew"));
  await act(async () => veg.used.finder?.open("buzz.finder/all"));
  expect(await selectedTab()).toBe("All of Buzz");
  await act(async () => veg.used.finder?.open("list"));
  expect(await selectedTab()).toBe("This channel");
  await act(async () => veg.used.finder?.open("buzz.finder/all"));
  await act(async () => veg.used.finder?.open("buzz.finder/channel"));
  expect(await selectedTab()).toBe("This channel");
});

test("a source leaves when its plugin stops, and All of Buzz shows instead", async () => {
  const fruit = consumer(() => ({
    id: "list",
    title: "Fruit",
    items: () => [item("Apple")],
  }));
  const { show, enable } = await mount({ "example.fruit": fruit.module });
  show();
  await act(async () => fruit.used.finder?.open("example.fruit/list"));
  expect(rows()).toEqual([expect.stringContaining("Apple")]);
  await enable("buzz.finder");
  expect(await selectedTab()).toBe("All of Buzz");
  expect(
    screen.queryByRole("button", { name: "Remove Fruit search scope" }),
  ).not.toBeInTheDocument();
  // Coming back, it waits to be opened again.
  await enable("buzz.finder", "example.fruit");
  await vi.waitFor(() => expect(fruit.used.finder).toBeDefined());
  expect(await selectedTab()).toBe("All of Buzz");
  expect(
    screen.queryByRole("button", { name: "Remove Fruit search scope" }),
  ).not.toBeInTheDocument();
});

test("a failing or empty list says so", async () => {
  const broken = consumer(() => ({
    id: "broken",
    title: "Broken",
    items: () => {
      throw new Error("no list");
    },
  }));
  const empty = consumer(() => ({
    id: "empty",
    title: "Empty",
    items: () => [],
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { show } = await mount({
    "example.broken": broken.module,
    "example.empty": empty.module,
  });
  show();
  await act(async () => broken.used.finder?.open("example.broken/broken"));
  expect(await screen.findByText("This list couldn't load.")).toBeVisible();
  await act(async () => empty.used.finder?.open("example.empty/empty"));
  expect(await screen.findByText("This list is empty.")).toBeVisible();
  type("x");
  expect(
    await screen.findByText("Nothing matches. Try fewer letters."),
  ).toBeVisible();
});

test("switching to another list keeps the text and shows only its rows", async () => {
  const ran = vi.fn();
  const first = consumer(() => ({
    id: "first",
    title: "First",
    items: () => [item("From first", ran)],
  }));
  const second = consumer(() => ({
    id: "second",
    title: "Second",
    items: () => [item("From second")],
  }));
  const { show } = await mount({
    "example.first": first.module,
    "example.second": second.module,
  });
  show();
  await act(async () => first.used.finder?.open("example.first/first"));
  type("from");
  expect(rows()).toEqual([expect.stringContaining("From first")]);
  await act(async () => second.used.finder?.open("example.second/second"));
  expect(screen.getByRole("combobox")).toHaveValue("from");
  expect(rows()).toEqual([expect.stringContaining("From second")]);
  expect(ran).not.toHaveBeenCalled();
});

test("⌘P leaves a list for the two scopes with the text kept, and This channel follows the conversation on screen", async () => {
  const fruit = consumer(() => ({
    id: "list",
    title: "Fruit",
    items: () => [item("Apple")],
  }));
  const { show, visit, leave } = await mount({
    "example.fruit": fruit.module,
  });
  show();
  visit("v1", "crew");
  await act(async () => fruit.used.finder?.open("example.fruit/list"));
  type("ap");
  fireEvent.keyDown(screen.getByRole("combobox"), {
    key: "p",
    code: "KeyP",
    ctrlKey: true,
  });
  expect(await selectedTab()).toBe("This channel");
  expect(screen.getByRole("combobox")).toHaveValue("ap");
  act(() => leave());
  expect(await selectedTab()).toBe("All of Buzz");
  expect(screen.getByRole("tab", { name: "This channel" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  act(() => visit("v2", "lab"));
  expect(await selectedTab()).toBe("This channel");
  expect(screen.getByRole("combobox")).toHaveValue("ap");
});

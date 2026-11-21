import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixture.mjs";
import { settle } from "./timeline.mjs";
import { holdReadingFocus, markAllRead } from "./reading.mjs";

// A channel's first paint is final. From the first frame a channel's rows are in
// the DOM, no visible row may change its text, height or place on screen, no
// row may enter or leave the viewport, and no indicator drawn over the timeline (the New messages
// line, Jump to latest) may appear, move or leave. Every fact these journeys
// show was on the relay before the channel opened, so no later frame is
// excused by new data.
//
// Each open path runs with all reads prompt, then with one class of read held
// until well after the open: membership notices, author profiles or read
// state. A held read is released only once Alpha has painted, or once the open
// waits on that held read itself, so it lands after the first paint. Known
// failures are marked as expected below; a fix that makes one pass fails the
// run until its mark is removed.

const UNREAD = 4;

test.use({
  productionBroker: true,
  readState: true,
  membershipActivity: true,
  historyCounts: { alpha: 60, beta: 5 },
  viewport: { width: 1280, height: 800 },
});

const history = (page) =>
  page.getByRole("region", { name: "Channel message history" });
const sidebarRow = (page, name) =>
  page.getByRole("button", { name: new RegExp(`^${name}`) });
const composer = (page, name) =>
  page.getByRole("textbox", { name: `Message #${name}`, exact: true });

/** What the open timeline showed in each painted frame, kept only when it
 * changed. A frame is read after it paints: requestAnimationFrame runs before
 * the same frame's ResizeObserver corrections, so reading there can record a
 * state that never reaches the screen. */
function recorder() {
  const state = { frames: [], t0: 0, last: "" };
  window.firstPaint = state;
  const visibleRows = (scroller) => {
    const viewport = scroller.getBoundingClientRect();
    return [...scroller.querySelectorAll("[data-message-id]")].flatMap(
      (row) => {
        const box = row.getBoundingClientRect();
        if (box.height <= 0 || box.bottom <= viewport.top) return [];
        if (box.top >= viewport.bottom) return [];
        return [
          {
            id: row.dataset.messageId,
            top: Math.round(box.top - viewport.top),
            height: Math.round(box.height),
            notice: row.hasAttribute("data-membership-row"),
            text: row.innerText.replace(/\s+/g, " ").trim().slice(0, 160),
          },
        ];
      },
    );
  };
  const sample = () => {
    const timeline = document.querySelector("[data-channel-timeline]");
    const scroller = document.querySelector(
      '[aria-label="Channel message history"]',
    );
    const line = scroller?.querySelector("[data-new-messages-boundary]");
    const viewportTop = scroller?.getBoundingClientRect().top ?? 0;
    const frame = {
      channel: timeline?.getAttribute("data-channel-timeline") ?? null,
      scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
      rows: scroller ? visibleRows(scroller) : [],
      line: line
        ? Math.round(line.getBoundingClientRect().top - viewportTop)
        : null,
      jump: timeline?.hasAttribute("data-jump-visible") ?? false,
    };
    const key = JSON.stringify(frame);
    if (key !== state.last) {
      state.last = key;
      state.frames.push({
        t: Math.round(performance.now() - state.t0),
        ...frame,
      });
      if (state.frames.length > 4000) state.frames.splice(0, 1000);
    }
  };
  // A task posted from a frame's callbacks runs after that frame paints.
  const painted = new MessageChannel();
  painted.port1.onmessage = sample;
  const tick = () => {
    painted.port2.postMessage(null);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Changes after the channel's first painted frame, first of each kind. */
function violations(frames, channel, { noticeNames }) {
  const first = frames.findIndex(
    (frame) => frame.t >= 0 && frame.channel === channel && frame.rows.length,
  );
  if (first < 0) return { firstPaintMs: null, changes: ["never painted"] };
  const base = frames[first];
  const byId = new Map(base.rows.map((row) => [row.id, row]));
  const found = new Map();
  const note = (kind, t, detail) => {
    if (!found.has(kind))
      found.set(kind, `${kind} at +${t - base.t}ms: ${detail}`);
  };
  for (const frame of frames.slice(first + 1)) {
    if (frame.channel !== channel) {
      note("left", frame.t, `timeline became ${frame.channel}`);
      break;
    }
    if (
      (frame.line === null) !== (base.line === null) ||
      Math.abs(frame.line - base.line) > 1
    )
      note("line", frame.t, `New messages line ${base.line} → ${frame.line}`);
    if (frame.jump !== base.jump)
      note("jump", frame.t, `Jump to latest ${base.jump} → ${frame.jump}`);
    const ids = frame.rows.map((row) => row.id);
    const added = ids.filter((id) => !byId.has(id));
    const removed = base.rows.filter((row) => !ids.includes(row.id));
    if (added.length || removed.length)
      note("rows", frame.t, `+${added.length} −${removed.length} visible rows`);
    for (const row of frame.rows) {
      const was = byId.get(row.id);
      if (!was) continue;
      // scrollTop alone is not visible: the virtualizer moves it when it
      // measures rows above the viewport, without moving what is on screen.
      if (Math.abs(was.top - row.top) > 1)
        note(
          "move",
          frame.t,
          `${row.id.slice(0, 8)} top ${was.top} → ${row.top}px`,
        );
      if (Math.abs(was.height - row.height) > 1)
        note(
          "height",
          frame.t,
          `${row.id.slice(0, 8)} ${was.height} → ${row.height}px`,
        );
      if (was.text !== row.text && (noticeNames || !row.notice))
        note(
          "text",
          frame.t,
          `${row.id.slice(0, 8)} "${was.text.slice(0, 40)}" → "${row.text.slice(0, 40)}"`,
        );
    }
  }
  return {
    firstPaintMs: base.t,
    changes: [...found.values()],
    lineAtEnd: frames.at(-1)?.line !== null,
  };
}

const isAlphaHead = (filter) =>
  filter.kinds?.includes(9) &&
  filter.top_level === true &&
  filter["#h"]?.includes("alpha") &&
  filter.until === undefined;

const holds = {
  none: () => false,
  // Membership notices are read beside the head; holding them holds that read.
  notices: (filters) =>
    filters.some((f) => f.kinds?.includes(40099) && f["#h"]?.includes("alpha")),
  profiles: (filters, viewer) =>
    filters.some(
      (f) => f.kinds?.includes(0) && f.authors?.some((id) => id !== viewer),
    ),
  readState: (filters) =>
    filters.some(
      (f) =>
        f.kinds?.includes(30078) &&
        (f.read_state_snapshot === 1 ||
          f["#t"]?.some((t) => t.startsWith("read-state"))),
    ),
};

/** Held reads wait from `arm` until `release`. Alpha head reads are timed from
 * `arm`; `idle` waits until every read that is not held has answered. */
async function instrument(page, app, held) {
  let gate;
  let armedAt = 0;
  const requests = [];
  // Reads that are not held, from submission until the page has the answer.
  const inflight = new Set();
  const done = (request) => inflight.delete(request);
  page.on("request", (request) => {
    if (!request.url().endsWith("/query")) return;
    const filters = request.postDataJSON() ?? [];
    if (!gate || !holds[held](filters, app.viewer)) inflight.add(request);
    if (armedAt && filters.some(isAlphaHead))
      requests.push({
        t: Date.now() - armedAt,
        priority: request.headers()["x-buzz-read-priority"] ?? "?",
      });
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) inflight.clear();
  });
  let heldHeads = 0;
  await page.route("**/query", async (route) => {
    const waiting = gate;
    const filters = route.request().postDataJSON() ?? [];
    if (waiting && holds[held](filters, app.viewer)) {
      const head = filters.some(isAlphaHead);
      if (head) heldHeads++;
      await waiting.promise;
      if (head) heldHeads--;
    }
    await route.fallback().catch(() => {});
  });
  return {
    requests,
    arm() {
      armedAt = Date.now();
      gate = held === "none" ? undefined : Promise.withResolvers();
    },
    /** Release once Alpha has painted rows, or once its open is waiting on
     * a held head read (callers have seen Alpha's composer). */
    async release() {
      await expect
        .poll(
          async () =>
            heldHeads > 0 ||
            (await page.evaluate(() =>
              window.firstPaint.frames.some(
                (frame) => frame.channel === "alpha" && frame.rows.length > 0,
              ),
            )),
        )
        .toBe(true);
      gate?.resolve();
    },
    async idle(scroller = history(page)) {
      await expect.poll(() => inflight.size).toBe(0);
      await settle(page, scroller);
      await expect.poll(() => inflight.size).toBe(0);
    },
  };
}

/** Alpha's saved head holds its newest row and the names of its authors. */
function savedHead(page, newestId) {
  return page.evaluate(
    (newestId) =>
      new Promise((resolve) => {
        const request = indexedDB.open("buzz-channel-heads-v1");
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("heads")) {
            db.close();
            return resolve(false);
          }
          const read = db
            .transaction("heads", "readonly")
            .objectStore("heads")
            .getAll();
          read.onsuccess = () => {
            db.close();
            resolve(
              read.result.some(
                (row) =>
                  row.channelId === "alpha" &&
                  row.profiles?.length > 0 &&
                  row.events?.some((event) => event.id === newestId),
              ),
            );
          };
          read.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    newestId,
  );
}

const unread = (app, content, deliver, createdAt) =>
  app.append(
    "primary",
    "alpha",
    content,
    deliver,
    false,
    undefined,
    undefined,
    [],
    createdAt ?? Math.floor(Date.now() / 1000) + 10,
  );

/** Alpha has history read through Mark all as read, then unread rows that
 * arrive while Beta is open, so opening it draws a New messages line. Reading
 * stays held so nothing reads Alpha's rows by being on screen. */
async function seed(page, app) {
  await holdReadingFocus(page);
  await page.addInitScript(recorder);
  await page.addInitScript(() => {
    // `saveData` switches off background warming and hover preparation. It
    // stays on until a path turns it off, so nothing reads Alpha early.
    window.fixtureSaveData = true;
    Object.defineProperty(Navigator.prototype, "connection", {
      configurable: true,
      get: () => ({ saveData: window.fixtureSaveData }),
    });
  });
  await page.goto(
    `${app.origin}/#buzz=${encodeURIComponent(
      JSON.stringify({
        version: 1,
        kind: "conversation",
        channelId: "beta",
        scope: {
          viewer: app.viewer,
          communityOrigin: "https://primary.example",
        },
      }),
    )}`,
  );
  await expect(composer(page, "Beta")).toBeVisible();
  await expect(
    history(page).locator("[data-message-id]").first(),
  ).toBeVisible();
  await settle(page);
  const published = app.report.readPublications.length;
  await markAllRead(page);
  await expect
    .poll(() => app.report.readPublications.length)
    .toBeGreaterThan(published);
  // Newer than the read mark, which is the time it was made.
  const now = Math.floor(Date.now() / 1000) + 1;
  let newest;
  for (let i = 0; i < UNREAD; i++)
    newest = unread(app, `Unread follow-up ${i}`, true, now + i);
  await expect(
    sidebarRow(page, "Alpha").locator("[data-channel-unread]"),
  ).toHaveCount(1);
  return newest;
}

/** Reload on Beta. Alpha was never read, so nothing of it is saved. */
async function reloadOnBeta(page) {
  await page.reload();
  await expect(composer(page, "Beta")).toBeVisible();
  await expect(
    history(page).locator("[data-message-id]").first(),
  ).toBeVisible();
  await settle(page);
}

async function clickOpen(page, name) {
  await sidebarRow(page, name).evaluate((button) => {
    window.firstPaint.t0 = performance.now();
    window.firstPaint.frames.length = 0;
    window.firstPaint.last = "";
    button.click();
  });
}

const paths = {
  async cold(page, _app, gates) {
    gates.arm();
    await reloadOnBeta(page);
    expect(
      gates.requests,
      "nothing read Alpha's head before the click",
    ).toEqual([]);
    await clickOpen(page, "Alpha");
  },
  async hover(page, _app, gates) {
    gates.arm();
    await reloadOnBeta(page);
    expect(
      gates.requests,
      "nothing read Alpha's head before the hover",
    ).toEqual([]);
    await page.evaluate(() => {
      window.fixtureSaveData = false;
    });
    await sidebarRow(page, "Alpha").hover();
    await expect.poll(() => gates.requests.length).toBe(1);
    await gates.idle();
    await clickOpen(page, "Alpha");
  },
  // The app shell turns roster warming off (service.ts `warm: false`), so a
  // head read before the first visit comes only from a hover. A revisit
  // adopts the head the first visit left in memory.
  async revisit(page, _app, gates) {
    gates.arm();
    await sidebarRow(page, "Alpha").click();
    await expect(composer(page, "Alpha")).toBeVisible();
    await gates.release();
    await gates.idle();
    await sidebarRow(page, "Beta").click();
    await expect(composer(page, "Beta")).toBeVisible();
    await gates.idle();
    gates.arm();
    await clickOpen(page, "Alpha");
  },
  async saved(page, _app, gates, newest) {
    // Alpha's head is saved on screen; the reload reopens Alpha from it.
    await sidebarRow(page, "Alpha").click();
    await expect(composer(page, "Alpha")).toBeVisible();
    await expect.poll(() => savedHead(page, newest.id)).toBe(true);
    gates.arm();
    await page.reload();
  },
  async reconnect(page, app, gates, _newest, held) {
    // Alpha's head is retained; while Beta is open the stream drops and more
    // unread rows land that only the reconnect's catch-up can read.
    await sidebarRow(page, "Alpha").click();
    await expect(composer(page, "Alpha")).toBeVisible();
    await settle(page);
    await sidebarRow(page, "Beta").click();
    await expect(composer(page, "Beta")).toBeVisible();
    gates.arm();
    const before = new Set(app.relay.sockets);
    app.relay.disconnect("primary");
    unread(app, "Missed while offline", false);
    await expect
      .poll(() =>
        app.relay.sockets.some(
          (socket) =>
            !before.has(socket) &&
            socket.community === "primary" &&
            socket.readyState === 1 &&
            socket.authenticated,
        ),
      )
      .toBe(true);
    // The catch-up reads Alpha's retained head in the background. While the
    // reconnect's profile or read-state reads are held, it does not start, so
    // those journeys open on the stale head.
    if (held === "none" || held === "notices")
      await expect.poll(() => gates.requests.length).toBeGreaterThan(0);
    await gates.idle();
    await clickOpen(page, "Alpha");
  },
};

// path → held reads that currently fail, with the cause. Measured in headless
// Chromium and WebKit against the fixture relay.
const names =
  "Notice rows paint before their names: a head read names only its message authors; notice actors and targets are read only once the window adopts the head";
const lineAfterRows =
  "The New messages line draws a render after the prepared head's rows, and its 24px divider moves them";
const lineWaitsForReadState =
  "The line waits for the read-state snapshot, then inserts its 24px divider and moves the rows";
const staleReconnect =
  "The reconnect catch-up has not read Alpha's retained head, so the missed row, its regrouping and the line arrive after paint";
const knownFailures = {
  cold: {
    profiles: names,
    readState: lineWaitsForReadState,
  },
  hover: {
    none: lineAfterRows,
    profiles: `${lineAfterRows}. ${names}`,
    readState: lineWaitsForReadState,
  },
  saved: Object.fromEntries(
    Object.keys(holds).map((held) => [
      held,
      "A saved head paints as cached; the line waits for the head read that verifies it, then its 24px divider moves the rows",
    ]),
  ),
  reconnect: {
    notices: `Holding notices holds the catch-up head read itself. ${staleReconnect}`,
    profiles: staleReconnect,
    readState: staleReconnect,
  },
};

for (const path of Object.keys(paths))
  for (const held of Object.keys(holds))
    test(`${path} open, ${held === "none" ? "prompt reads" : `held ${held}`}: first paint is final`, async ({
      page,
      app,
    }, testInfo) => {
      const cause = knownFailures[path]?.[held];
      test.fail(!!cause, cause);
      const newest = await seed(page, app);
      const gates = await instrument(page, app, held);
      await paths[path](page, app, gates, newest, held);
      await expect(composer(page, "Alpha")).toBeVisible();
      await gates.release();
      await expect(
        history(page).locator("[data-message-id]").first(),
      ).toBeVisible();
      await gates.idle();
      const frames = await page.evaluate(() => window.firstPaint.frames);
      // A notice row's names are read only after its head lands, so with
      // prompt profiles they race the first paint. The held-profiles case
      // decides that race; the others leave notice names out of scope.
      const result = violations(frames, "alpha", {
        noticeNames: held === "profiles",
      });
      const report = testInfo.outputPath("first-paint.json");
      await writeFile(
        report,
        JSON.stringify(
          { path, held, ...result, headReads: gates.requests, frames },
          null,
          1,
        ),
      );
      await testInfo.attach("first-paint.json", {
        path: report,
        contentType: "application/json",
      });
      expect(result.lineAtEnd, "the open draws a New messages line").toBe(true);
      expect(result.changes).toEqual([]);
    });

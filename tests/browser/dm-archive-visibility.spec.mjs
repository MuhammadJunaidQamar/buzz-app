import { test, expect } from "./fixture.mjs";
import { open } from "./timeline.mjs";

test.use({
  productionBroker: true,
  readState: true,
  dmLabels: true,
  historyCounts: { alpha: 1, beta: 1 },
});

// The browser boundary is the mounted app's sidebar, retained conversation,
// composer draft and search navigation across authoritative snapshot refreshes.
// Archive-state and participant matrices live in ChannelInventory.test.tsx.
test("archived one-to-one DMs leave the sidebar while history and open drafts survive", async ({
  page,
  app,
}, testInfo) => {
  const old = app.append(
    "primary",
    "dm-peer",
    "Preserved DM history",
    false,
    false,
  );
  await open(page, app);
  const sidebar = page.getByRole("navigation", { name: "Subscribed channels" });
  const dm = sidebar.locator('[data-channel-id="dm-peer"]');
  const group = sidebar.locator('[data-channel-id="dm-group"]');
  await dm.click();
  const conversation = page.getByRole("article", {
    name: "Conversation",
    exact: true,
  });
  const history = conversation.locator(`[data-message-id="${old.id}"]`);
  await expect(history).toContainText("Preserved DM history");
  const composer = conversation.getByRole("textbox", { name: /^Message / });
  await composer.fill("Keep this draft");

  const archiveReads = () =>
    app.report.queries.filter(({ filter }) => filter.kinds?.includes(13535))
      .length;
  const refresh = async (keys) => {
    const before = archiveReads();
    app.setArchivedIdentities(keys);
    app.relay.disconnect("primary");
    await expect.poll(archiveReads).toBeGreaterThan(before);
    await expect
      .poll(() => app.relay.hasRoute("primary", "dm-peer"))
      .toBe(true);
  };
  await refresh([app.participants[0]]);
  await expect(dm).toHaveCount(0);
  await expect(group).toBeVisible();
  await expect(history).toContainText("Preserved DM history");
  await expect(composer).toHaveText("Keep this draft");
  await page.screenshot({
    path: testInfo.outputPath("archived-light-wide.png"),
  });

  // Reopening history from search must not override archive presentation.
  await sidebar.locator('[data-channel-id="alpha"]').click();
  await page.getByRole("button", { name: "Search Buzz", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Search Buzz" });
  await search.getByRole("combobox", { name: "Search Buzz" }).fill("Alice");
  await search
    .getByRole("option")
    .filter({ hasText: "Alice Fixture" })
    .first()
    .click();
  await expect(history).toContainText("Preserved DM history");
  await expect(composer).toHaveText("Keep this draft");
  await expect(dm).toHaveCount(0);

  await page.reload();
  await expect(history).toContainText("Preserved DM history");
  await expect(dm).toHaveCount(0);
  await expect(group).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("buzz-appearance.v1", "dark");
  });
  await page.reload();
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(history).toContainText("Preserved DM history");
  await expect(dm).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("archived-dark-narrow-large-text.png"),
  });

  await refresh([]);
  await expect(dm).toBeVisible();
  await expect(history).toContainText("Preserved DM history");
  expect(app.histories.get("primary/dm-peer")).toContainEqual(old);
  expect(
    app.report.publications.filter(({ event }) =>
      [9002, 9008, 9009, 9010].includes(event.kind),
    ),
  ).toEqual([]);
});

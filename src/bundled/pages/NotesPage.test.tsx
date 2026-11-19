// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { render, workspaceFixture } from "./ui-testing";
import { WorkingNotesCommunity } from "./WorkingNotesPage";

it("lists all readable docs together with last-editor attribution and searches across creators", async () => {
  const f = await workspaceFixture();
  const mine = f.seed("My plan", "Updated by my agent");
  await f.edit(f.carl, mine, { title: mine.title, markdown: mine.markdown });
  const agent = f.seed("Agent outline", "Updated by a human");
  const other = f.seed("Research plan", "A shared document");
  const privateNote = f.seed("Private plan", "Private content");
  const agentStorage = f.channels.get(agent.channel);
  const sharedStorage = f.channels.get(other.channel);
  const privateStorage = f.channels.get(privateNote.channel);
  if (!agentStorage || !sharedStorage || !privateStorage)
    throw new Error("Missing fixture storage");
  agentStorage.creator = f.carl.pubkey;
  sharedStorage.creator = f.sam.pubkey;
  sharedStorage.roles = { [f.sam.pubkey]: "owner", [f.viewer.pubkey]: "guest" };
  privateStorage.creator = f.carl.pubkey;
  privateStorage.roles = { [f.carl.pubkey]: "owner" };

  render(<WorkingNotesCommunity workspace={f.workspace} />);
  const list = within(await screen.findByRole("list", { name: "Docs" }));
  await within(await list.findByRole("link", { name: mine.title })).findByTitle(
    "Last edited by Carl",
  );
  expect(list.getByRole("link", { name: agent.title })).toBeVisible();
  expect(list.getByRole("link", { name: other.title })).toBeVisible();
  expect(list.queryByRole("link", { name: privateNote.title })).toBeNull();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "plan" },
  });
  expect(list.getByRole("link", { name: mine.title })).toBeVisible();
  expect(list.getByRole("link", { name: other.title })).toBeVisible();
  expect(list.queryByRole("link", { name: agent.title })).toBeNull();

  fireEvent.click(list.getByRole("link", { name: other.title }));
  const article = await screen.findByRole("article", { name: other.title });
  await within(article).findByText("You have read access.");
  fireEvent.click(screen.getByRole("button", { name: "Back to docs" }));
  expect(screen.getByRole("searchbox")).toHaveValue("plan");
});

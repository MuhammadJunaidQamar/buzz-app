// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRelaySession } from "../relay/session";
import { keypair, signed } from "../relay/testing";
import type { LiveCallbacks } from "../relay/live";
import { localAgentsFixture } from "../agents/local-testing";
import { useTemplateAgents } from "./useTemplateAgents";

afterEach(cleanup);

it("finishes template archive checks over HTTP during a socket-only outage", async () => {
  const viewer = keypair(),
    relay = keypair(),
    agent = keypair();
  const query = vi.fn(async () => [
    signed(relay, {
      kind: 13535,
      content: "",
      tags: [["-"]],
    }),
  ]);
  let live!: LiveCallbacks;
  const owner = createRelaySession(
    {
      viewer: viewer.pubkey,
      relayAuthor: relay.pubkey,
      archiveAuthority: relay.pubkey,
      scope: "https://relay.example.test",
      media: () => undefined,
      query,
      subscribe(callbacks) {
        live = callbacks;
        return { update() {}, retry() {}, dispose() {} };
      },
    },
    {
      agentChoices: localAgentsFixture([
        {
          pubkey: agent.pubkey,
          name: "Template agent",
          relayUrl: "wss://relay.example.test",
          owner: viewer.pubkey,
        },
      ]),
    },
  );
  try {
    live.state({ status: "connected", routes: [] });
    live.state({ status: "retrying", routes: [] });
    const { result } = renderHook(() =>
      useTemplateAgents(owner.session, {
        id: "template",
        name: "Template",
        agents: [agent.pubkey],
        teams: [],
        canvas: "",
      }),
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.checking).toBe(false);
    expect(result.current.agents).toEqual([agent.pubkey]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(owner.session.live.snapshot().status).toBe("retrying");
  } finally {
    cleanup();
    act(() => owner.dispose());
  }
});

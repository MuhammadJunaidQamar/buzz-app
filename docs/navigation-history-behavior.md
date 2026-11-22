# Navigation history behavior

Dialogs and content tabs follow the [navigation history and dismissal contract](navigation-history.md).
The integrated families are Members, Settings sections, provider controls opened
within Settings or through Agents-page links, agent config version inspectors,
the community join dialog, inline threads and the layers over a view, and thread,
Profile and GitHub tabs.

Plugin account-action dialogs in the profile menu are a documented exception.
They live in the profile menu's own state and create no visit: Back/Forward
leaves them as they are, and closing one adds or retires nothing. Moving them to
the navigation owner would change every account action at once. Focus's dialog
holds one short choice with no draft or pending work; other account actions,
such as Send feedback, can hold drafts and uploads.

Back/Forward revisits content and restores the selected thread while retaining
open tabs. X (and the equivalent explicit tab
close controls) removes the thread and retires its addressed visits. Traversal
skips those dismissed visits; Close does not add another visit that Back undoes.
Unrelated channel/message visits remain. A cold thread closes to its own channel
in place. Explicitly opening the same thread later creates a fresh visit.
Back/Forward returns a thread to where the reader left it in this window; only
a fresh opening, or a return to a place no longer loaded, reveals a linked
message again. If the channel's latest messages were evicted meanwhile, the
thread can briefly show its end before it returns to that place.
The same rule covers message links that open in the channel timeline rather
than in a thread: Back/Forward returns the timeline to where the reader left
it, whether it comes from another channel or from another link in the same
channel. Following the link again, Retry and opening the visit already shown
are fresh openings and reveal the message. The place Back returns to is also
where a later plain visit to that channel opens, with one exception: if a
reveal left the reader less than 80 px from the end, Back keeps the message
where the reveal placed it, but a plain visit opens at the latest message, as
it does after the reader scrolls that close to the end.

Profiles and GitHub use the same rule. Their read-only target and optional
thread context are carried as `detail` in the scoped conversation address;
Back/Forward restores selection and reload resolves the panel through the
existing registry. Plugins that specialize canonical profile targets and opt in with
`component.profileHistory = true` keep the same history behavior. Unmarked catch-all
panels retain their existing local behavior.
A new link replaces the transient Profile/GitHub detail;
opening a thread clears it. Replacement does not retire the earlier visit, so
Back/Forward can reconstruct it. Explicitly retained tabs keep their existing rules.
Replacing the live session within the same account/community reconstructs the
read-only address, including after deliberate same-community resets. Old panel
callbacks are revoked; local editors do not carry across sessions. A different
account/community scope clears the current detail address once known; a
temporarily unknown reconnect scope does not.
Thread/detail dismissal records survive same-scope session replacement, including
verified reply roots. Closing reconstructed content retires its earlier visits
as well as its current one; this does not carry layout or live panel objects.
An inactive X preserves the selected content while retiring the closed tab's
known visits. Other panel families keep their existing behavior. Navigation
does not recreate terminal sessions or change pane layout history. Close other
tabs and Close all tabs retire the complete set of closed content visits in one
navigation transaction, including inactive tabs. The kept tab stays selected;
underlying channel/message visits and other channel workspaces remain available.

Members follows the same rule: opening it adds a visit. Back closes it while
staying on the channel; Forward restores it. X, Escape and outside dismissal
retire that visit, so the next Back leaves the channel and
Forward keeps Members closed. A link handoff replaces the Members visit with
its destination when the channel opener is known; cold handoffs retain a channel
visit beneath the new destination.

An inline thread is a dialog on its conversation's visit: `inline` names its
root in the conversation address, so a conversation has at most one, and a new
one replaces it. The **Open threads in** setting (Inline) only decides which
field an opening writes; after that the address alone says what is open. One
function, `placeOpening` (`src/bundled/channels/placement.ts`), makes that
decision for threads, link panels, profiles, thread links and Solo chat links.
Back closes an inline thread and stays in the channel; Forward restores it. ✕,
Escape and the scrim retire every visit naming it, with a layer read over it.
Move to side panel is a handoff: it retires those visits and replaces the
current one with the thread's tab, so Back never shows the thread inline beside
its tab. A thread that has a tab opens there instead, and an address that
names a thread with a tab shows only the tab. Solo threads, threads opened from
a thread tab, links to threads in other channels and read-only channels open
tabs as before. Leaving the channel leaves the dialog in its visit, which Back
restores.

Every view (the conversation, its inline thread, a thread tab) can have one
layer on top: a details message, or under Inline a panel opened from one of
its messages, such as a profile from an avatar or name, a pull request, a diff
or a plugin's link panel. The address has one `layer` field
(`{ messageId | target, threadId?, rootId?, channelId? }`): `messageId` is a
details message, `target` a panel opened from a message in `threadId`'s thread.
With no `rootId` the layer is the conversation's; with the inline thread's root
it is a nested layer over that thread; otherwise it belongs to the thread tab
with that root, in `channelId` when that tab belongs to another channel.
Opening another layer, from any view, replaces it with a visit of its own, and
so does a panel's own `open` or `push` inside it: Back walks thread → profile →
pull request in order, and reload restores what the address names. Over an
inline thread, Back closes the layer first and then the thread, as Settings'
nested provider visits do. ✕, Escape and the scrim retire the layer's visits; a
send from that view's composer does so for details. Open as tab on a panel
layer retires its visits and opens its tab, as Move to side panel does for a
thread; the composer underneath keeps its text. An opening that already has a
tab focuses that tab, so nothing is inline and in a tab at once. A details
reader appears once its message's row is loaded, and a hidden tab's layer waits
for the tab. A panel draws as a full-height sheet over the view's composer, or
as a centered dialog when that composer is not on screen; details fit their
content. Pages without a conversation address (Inbox, Sessions, saved drafts)
open details as a local dialog with no visit, and their panels as before.

### What Inline still opens as a tab

Inline means the viewer opts out of tab management, so the goal is that
everything opened from a view opens on it. A panel registration opts out with
`inline: false`; these still open as tabs, and are the follow-up list for full
coverage:

- **Huddles**, **Canvas** and **BuilderLab apps**: each holds a live lifetime
  (a call, an editor, a running app). A dialog unmounts on Back and ✕, which
  would end it. Each moves inline by dropping its declaration once that
  lifetime survives the dialog closing, with no change to the page.
- **Terminal**: a bottom drawer launched from the channel header, not an
  opening from a view; Inline does not touch it.
- Links from outside a message row (Members, the channel header, an agent's
  request to show something) and thread or conversation links that a panel
  opens through navigation keep their current routing.

Media keeps its own viewer under every setting.

Settings Close retires its known section visits for the same account/community
scope and returns to the covered workspace. A visit that names no community, as
links and shortcuts to Settings do, counts as Settings for whatever is selected
when Settings closes. Back/Forward between sections remains reversible until
Close. Back/Forward to Manage plugins reopens the plugin details that visit
showed; opening it from another section starts at the list.
Profile discard confirmation precedes dismissal and Back/Forward departure.
Keep editing preserves the mounted draft and current visit; Discard changes
continues the requested traversal without retiring the Settings visit.
Agents-page provider controls retire that provider's known visits on the same
scoped Agents page, preserving other providers and page visits. Their pending-work
close protection remains in the shared Dialog. Settings → Agent setup provider
controls get a nested Settings visit: Back closes the provider while leaving
Settings open, Forward restores it, and provider Close retires only its nested
visits. Closing Settings retires its sections and nested provider visits together.
Restoration opens controls, never an install, sign-in or save operation. This does
not add new history visits to every existing confirmation or editor.

Agent config version dialogs retain an expanded Previous versions list and its
scroll position underneath, in both the Agents page and owned-agent profiles.
Back returns to that list;
Forward restores the selected version using the current config store. Close,
Escape, outside dismissal and a confirmed revert retire that version's visits
within the same account/community scope. Restoring a dialog never submits a revert.
The shared Dialog blocks explicit dismissal during a revert; passive traversal
can hide it while the existing write continues. Completion retires its presentation
even after Back. A cold or reloaded address reloads history; Load older remains
available in the dialog if the selected revision is beyond the loaded page.

The community join dialog is a `join` presentation (`{ viewer, visit, community? }`)
on the visit beneath it: a page, conversation or Settings section. `visit` is an
opaque token for one opening of the dialog. Invite links, the picker's **Join a
community** (no address yet) and the `communityJoin` capability (Builderlab's
Settings **Create community**) open it as a new visit. The visit beneath stays
presented and keeps its own visit, as it does under Settings. Back closes the
dialog and returns to that visit; Forward reopens it. Close and Escape retire
that opening's visits and return to the visit beneath. Closing the view beneath
(for example Settings Close) also retires the joins presented over it; a close
by id can also retire a join over a later visit of the same view. A finished
join replaces its visit with the joined community's page, so Back returns to the
view beneath the dialog, and retires every other opening that now offers that
viewer the community actually joined (its edited address, else its original).
The target holds the address only. The invite code, the one-use instruction to
connect at once (for a community just created) and the dialog's form as edited
(address, code, and the profile once changed) stay in memory, keyed by the
opening's token: Back and Forward in the running app restore that opening's form
only. Editing the address clears the code, so a code never returns beside
another address. A restored profile applies only to the community it was edited
for, and gives way to a profile a later publish attempt recorded in the join
journal. Reload and a restored link show the target's address, with no code and no
form. Forward, reload and a restored link never look up,
claim or publish by themselves; they wait for Continue. The dialog shows only
for the viewer it was opened for, and a change of viewer discards the other
viewer's codes. While the access or profile step writes, Close is disabled and
Back/Forward bounces back to the dialog. Two cases open without a visit: first
run's landing (no community yet) keeps its pasted address in its own state, as
there is no view beneath it; and while a failed link waits for Retry, the
picker's **Join a community** opens in place, because a new visit would replace
the failure and its Retry.

## History and lifetime boundaries

App arrows, supported history shortcuts, mouse Back/Forward buttons and, in
the macOS app, three-finger trackpad swipes (when Swipe between pages is set
to three fingers, or two or three fingers) use the same navigation driver.
Browsers retain their physical history entries; the driver
skips retired entries rather than claiming to delete arbitrary native history.
The app's traversal affordances account for those skipped entries. The managed
window is capped at 100 visits, including its persisted dismissal associations;
older return paths expire and their tab metadata is pruned. Dismissal
indices are kept in sessionStorage for the browser chain; open tabs themselves
retain their existing community-session lifetime. After reload the driver knows
the current visit and its immediate opener. Older visits not revisited since
reload may remain reachable after closing the same content; workspace restoration
across refresh is separate from this behavior.

## Evidence boundaries

Colocated tests cover driver traversal, inactive dismissal, cold targets, verified
thread roots and navigation-attempt lifetime. The browser regression files prove
actual popstate/hashchange traversal, X and two-tab behavior, and the reading
place of linked threads and channel timelines, in the production components
with the existing disposable relay fixture. They do not establish
native desktop acceptance. Manual comparison and acceptance steps are recorded
in the pull request description.

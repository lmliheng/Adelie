# Permission menu icons, no thinking-level footnote, and the Trace tab and file editor held to their width

- **Date:** 2026-10-10
- **Type:** fix
- **Scope:** `web`, `ui`

[中文版](2026-10-10-ui-polish-batch.zh.md)

This is ported from upstream PenguinHarness (#1007, commit `2604c5d2`), one part left out: the change that held the UI package's fold body to the fold's width, since this tree has no `Fold` component.

Four Web App touches: each row of the composer's permission menu was led by its level's shield, the session thinking-level menu lost its footnote, the Trace tab stopped cutting its rounds and its summary off on the right, and pressing Edit on a file stopped rewrapping its text.

## Details

- Each row of the composer's permission menu (the presets, or the approval modes while the Sandbox switch is off) showed, before its name, the shield the permission button takes once that row is picked, in the button's tone: amber for full access and partial permission, told apart by the glyph, green for read-only and muted for off. An unavailable row dimmed its shield with it. An administrator's **More…** row took a gear, so its name lines up with the rows above it, and the menu's minimum width grew by about the shield's width, so the longest built-in row keeps its whole name beside a note such as "Admin only".
- The session composer's thinking-level menu no longer ended with "Applies right away. Changing it invalidates the model's cached context — compacting first is recommended." A mid-chat change still opens the confirm dialog that says what the switch costs and offers to compact first. The string left both dictionaries.
- The Trace tab's overall summary set its three groups side by side only where its own card is wide enough for every label and value, measured on the card (a container query) rather than on the viewport. In a dock beside the conversation the three columns had cut most of the values short; a card narrower than that stacks the groups instead. Upstream's other cause of a Trace round being clipped — the fold body's `min-w-0` — is not in this tree, which has no `Fold` component: an open round here is not widened by it.
- With wrapping on, the file editor's text layer and textarea took the scroll box's width. An unbreakable run, such as a long token or URL, had widened both layers to its own length, so pressing Edit rewrapped every line at that width and changed the text's height. Editing now wraps exactly where the source view does.

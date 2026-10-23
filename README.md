# pi-tmux-status-ext

Show Pi's state in the tmux status bar, so you can tell from another window
whether Pi is still working or is waiting for you.

| Window status | Meaning |
|---|---|
| **Orange** (`colour208`) | The agent loop is running |
| **Yellow** | Pi is settled and waiting for input |
| **Default** | No Pi state, or Pi has exited |

The focused window is deliberately left alone, so it keeps the global
`window-status-current-style` from your `tmux.conf` (red in the typical setup).
Only background windows get recolored.

- Recolors `window-status-style` and the activity/bell/last variants, so a
  background alert cannot override the state color.
- **Acknowledge on visit:** the yellow idle highlight is a notification. It is
  cleared when you select the window, so a visited-but-idle window shows no
  highlight. The orange running highlight is a live state and is not cleared by
  visiting; the next state transition replaces it.
- Restores the tmux defaults when Pi shuts down.
- Uses the final `agent_settled` hook rather than `agent_end`, because Pi may
  still auto-retry, auto-compact, or drain queued follow-ups after `agent_end`.
- Only active when Pi runs inside tmux (`TMUX` / `TMUX_PANE` are set). Outside
  tmux the extension does nothing.

## Requirements

- tmux (developed against tmux 3.8)
- Pi running in a tmux pane

## Install

Symlink this directory into Pi's extension directory. The repo is called
`pi-tmux-status-ext`, but the symlink is named `tmux-status` because Pi derives
an extension's display name from its path — so Pi lists it as `tmux-status`.

```sh
ln -sfn /Users/baptiste/Documents/Dev/pi-tmux-status-ext ~/.pi/agent/extensions/tmux-status
```

If the old single-file extension is still there, remove it first; otherwise Pi
loads both copies and installs the hooks twice:

```sh
rm ~/.pi/agent/extensions/tmux-status.ts
```

Then run `/reload` in Pi (or restart it).

## Notes

The extension installs a global `after-select-window` hook that clears the
per-window highlight when the window is visited. It writes per-window tmux
options (`window-status-*-style`, `@pi_highlight`) and refreshes attached
clients so the status bar updates immediately.

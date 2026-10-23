/**
 * Tmux Status Extension
 *
 * Recolors the tmux *background* window pi is running in so the status bar
 * reflects state while you are looking at another window:
 *   - orange (colour208) while the agent loop is running
 *   - yellow while pi is settled and waiting for user input
 *   - back to the tmux default when the session ends
 *
 * The focused window is deliberately left untouched so it keeps the tmux.conf
 * global "current window" style (red) regardless of pi's state.
 *
 * Acknowledge-on-visit: the yellow "waiting for input" highlight is a
 * notification. Visiting the window clears it (via an `after-select-window`
 * hook), so leaving an already-visited idle window shows no highlight. The
 * orange "running" highlight is a live state and is not cleared by a visit;
 * only a state transition (finish) replaces it.
 *
 * Uses the final `agent_settled` hook rather than `agent_end`, because pi may
 * still auto-retry, auto-compact, or drain queued follow-ups after `agent_end`.
 *
 * Only active when pi runs inside tmux (TMUX / TMUX_PANE present).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";

const ORANGE = "bg=colour208,fg=black"; // running
const YELLOW = "bg=yellow,fg=black"; // settled, waiting for input

// Styles applied to the non-focused (background) window to reflect pi's state.
const STATE_STYLE_OPTS = [
	"window-status-style",
	// The status format appends alert styles *after* the base style, so a
	// background activity/bell flag would recolor the window and only clear
	// when the window is focused. Pin them per-window to the state color.
	"window-status-activity-style",
	"window-status-bell-style",
	"window-status-last-style",
];

// Never override these: the focused window keeps the tmux.conf global (red).
const FOCUSED_STYLE_OPTS = ["window-status-current-style"];

// Per-window user option that marks an unacknowledged idle (yellow) highlight.
const MARKER = "@pi_highlight";

// Global hook: when a window is selected, drop its idle highlight if pending.
// `; true` keeps the short-circuit from reporting a non-zero exit to tmux.
const ACK_HOOK =
	'run-shell "tmux show-options -wqv -t #{window_id} @pi_highlight | grep -q ^1 && { ' +
	"tmux set-option -uw -t #{window_id} window-status-style; " +
	"tmux set-option -uw -t #{window_id} window-status-activity-style; " +
	"tmux set-option -uw -t #{window_id} window-status-bell-style; " +
	"tmux set-option -uw -t #{window_id} window-status-last-style; " +
	"tmux set-option -uw -t #{window_id} @pi_highlight; }; true\"";

function inTmux(): boolean {
	return Boolean(process.env.TMUX && process.env.TMUX_PANE);
}

function tmux(args: string[]): string | undefined {
	try {
		return execFileSync("tmux", args, { encoding: "utf8" });
	} catch {
		return undefined;
	}
}

function windowId(): string | undefined {
	if (!process.env.TMUX_PANE) return undefined;
	return tmux(["display-message", "-p", "-t", process.env.TMUX_PANE, "#{window_id}"])?.trim();
}

function isActive(win: string): boolean {
	return tmux(["display-message", "-p", "-t", win, "#{window_active}"])?.trim() === "1";
}

function refreshStatusLines(): void {
	// `refresh-client -S` without -t is only honored when bound to a key, so
	// from a subprocess we must target each attached client explicitly.
	const clients = tmux(["list-clients", "-F", "#{client_name}"])?.split("\n").map((s) => s.trim()).filter(Boolean) ?? [];
	for (const client of clients) {
		tmux(["refresh-client", "-S", "-t", client]);
	}
}

/**
 * Apply `style` to the background-facing window styles. When `idle` is true the
 * unacknowledged marker is set so visiting the window clears the highlight.
 */
function setHighlight(win: string, style: string, idle: boolean): void {
	for (const opt of STATE_STYLE_OPTS) {
		tmux(["set-option", "-w", "-t", win, opt, style]);
	}
	// Running highlights are not acknowledged by visiting.
	if (idle) tmux(["set-option", "-w", "-t", win, MARKER, "1"]);
	else tmux(["set-option", "-uw", "-t", win, MARKER]);
	// Focused window always uses the global (red).
	for (const opt of FOCUSED_STYLE_OPTS) {
		tmux(["set-option", "-uw", "-t", win, opt]);
	}
	refreshStatusLines();
}

/** Remove all per-window overrides so the tmux.conf globals apply again. */
function clearHighlight(win: string): void {
	for (const opt of [...STATE_STYLE_OPTS, MARKER]) {
		tmux(["set-option", "-uw", "-t", win, opt]);
	}
	for (const opt of FOCUSED_STYLE_OPTS) {
		tmux(["set-option", "-uw", "-t", win, opt]);
	}
	refreshStatusLines();
}

export default function (pi: ExtensionAPI) {
	if (!inTmux()) return;

	pi.on("session_start", async () => {
		// Install the acknowledge hook (idempotent; shared by all pi windows).
		tmux(["set-hook", "-g", "after-select-window", ACK_HOOK]);
		const win = windowId();
		// On startup/reload/new/resume pi is idle and waiting for input.
		if (win) setHighlight(win, YELLOW, true);
	});

	pi.on("agent_start", async () => {
		const win = windowId();
		if (win) setHighlight(win, ORANGE, false);
	});

	pi.on("agent_settled", async () => {
		const win = windowId();
		if (!win) return;
		// If you are looking at the window there is nothing to notify about.
		if (isActive(win)) clearHighlight(win);
		else setHighlight(win, YELLOW, true);
	});

	pi.on("session_shutdown", async () => {
		const win = windowId();
		if (win) clearHighlight(win);
	});
}
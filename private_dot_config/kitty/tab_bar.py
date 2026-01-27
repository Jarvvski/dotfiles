"""Custom tab bar for Kitty - matches WezTerm Moonlight setup.

Provides:
- Per-tab: workspace digit icon + process icon + cwd/process name
- Right side: battery %, Spotify now-playing with progress bar, date/time
- All external commands are cached with TTL to avoid blocking the tab bar draw.
"""

import subprocess
import time
import os
import math
from datetime import datetime

from kitty.boss import get_boss
from kitty.fast_data_types import Screen, get_options
from kitty.tab_bar import DrawData, ExtraData, TabBarData, as_rgb, draw_title
from kitty.utils import color_as_int


# --- Colors ---
# BAR_BG is read dynamically from the active theme's background color.
# All other colors are accent/UI colors that work on both dark themes.
ACTIVE_BG = 0x3e68d7
ACTIVE_FG = 0xffffff
ACTIVE_ICON = 0xc099ff
INACTIVE_BG = 0x1e2030
INACTIVE_FG = 0x828bb8
INACTIVE_ICON = 0x82aaff

# Status bar colors
BATTERY_COLOR = 0x7dcfff
BATTERY_LOW = 0xf7768e
SPOTIFY_PROGRESS = 0x9ece6a
SPOTIFY_TRACK_BG = 0x7dcfff
SPOTIFY_TRACK_FG = 0x000000
SPOTIFY_TIME = 0x444257
DATE_COLOR = 0xc8d3f5
TIME_COLOR = 0x82aaff
SEPARATOR_COLOR = 0x3e68d7


def _get_bar_bg():
    """Read background color from active Kitty theme."""
    opts = get_options()
    return color_as_int(opts.background)

# --- Process Icons ---
ICONS = {
    # Editors
    "nvim": "\ue62b",          #  (vim icon)
    "vim": "\ue62b",           #  (vim icon)
    "nano": "\uf044",          #  (edit icon)
    "code": "\ue70c",          #  (vscode)
    # Shells (use terminal icon same as default)
    "zsh": "\uf120",           #  (terminal)
    "bash": "\uf120",          #  (terminal)
    "fish": "\uf120",          #  (terminal)
    # JavaScript / Node
    "node": "\ue718",          #  (node.js)
    "bun": "\ue718",           #  (node.js)
    "deno": "\ue718",          #  (node.js)
    "npm": "\ue71e",           #  (npm)
    "pnpm": "\ue71e",          #  (npm)
    "yarn": "\ue718",          #  (node.js)
    # Python
    "python": "\ue73c",        #  (python)
    "python3": "\ue73c",       #  (python)
    "pip": "\ue73c",           #  (python)
    # Rust
    "cargo": "\ue7a8",         #  (rust)
    "rustc": "\ue7a8",         #  (rust)
    # Go
    "go": "\ue724",            #  (go)
    # Java / JVM
    "java": "\ue738",          #  (java)
    "gradle": "\ue70e",        #  (gradle)
    "mvn": "\ue738",           #  (java)
    "kotlin": "\ue634",        #  (kotlin)
    # Git
    "git": "\ue702",           #  (git)
    "lazygit": "\ue702",       #  (git)
    "gh": "\ue708",            #  (github)
    # DevOps / Infra
    "docker": "\ue7b0",        #  (docker)
    "kubectl": "\ue7b2",       #  (kubernetes)
    "terraform": "\U000f1062", # 󱁢 (terraform)
    "ssh": "\uf023",           #  (lock)
    "tmux": "\ue795",          #  (terminal split)
    # AI
    "claude": "\uf0eb",        #  (lightbulb)
    # Ruby
    "ruby": "\ue739",          #  (ruby)
    "irb": "\ue739",           #  (ruby)
    # Misc tools
    "htop": "\uf080",          #  (bar chart)
    "btop": "\uf080",          #  (bar chart)
    "top": "\uf080",           #  (bar chart)
    "man": "\uf02d",           #  (book)
    "less": "\uf02d",          #  (book)
    "make": "\uf085",          #  (gears)
    "cmake": "\uf085",         #  (gears)
    "curl": "\uf0ac",          #  (globe)
    "wget": "\uf0ac",          #  (globe)
}
DEFAULT_ICON = "\uf120"  #  (terminal)

# Workspace digit icons (Legacy Computing block)
DIGIT_ICONS = [
    "\U0001FBF0", "\U0001FBF1", "\U0001FBF2", "\U0001FBF3", "\U0001FBF4",
    "\U0001FBF5", "\U0001FBF6", "\U0001FBF7", "\U0001FBF8", "\U0001FBF9",
]


# --- Cached Status ---
class StatusCache:
    def __init__(self, ttl=30):
        self.ttl = ttl
        self._battery = ""
        self._battery_low = False
        self._spotify = ""
        self._last_update = 0

    def _needs_refresh(self):
        return time.time() - self._last_update > self.ttl

    def _refresh(self):
        self._last_update = time.time()
        self._update_battery()
        self._update_spotify()

    def _update_battery(self):
        try:
            result = subprocess.run(
                ["/bin/zsh", "-c", "pmset -g batt | grep -o '[0-9]*%'"],
                capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0 and result.stdout.strip():
                pct = result.stdout.strip().replace("%", "")
                self._battery = f"\U000f1a06 {pct}%"  # 󰚥
                self._battery_low = int(pct) < 30
            else:
                self._battery = ""
        except Exception:
            self._battery = ""

    def _update_spotify(self):
        try:
            script = os.path.expanduser(
                "~/.config/wezterm/spotify-progress.applescript"
            )
            if not os.path.exists(script):
                self._spotify = ""
                return
            result = subprocess.run(
                ["/bin/zsh", "-c", f"osascript {script} 2>/dev/null"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0 and result.stdout.strip():
                self._spotify = result.stdout.strip()
            else:
                self._spotify = ""
        except Exception:
            self._spotify = ""

    @property
    def battery(self):
        if self._needs_refresh():
            self._refresh()
        return self._battery

    @property
    def battery_is_low(self):
        if self._needs_refresh():
            self._refresh()
        return self._battery_low

    @property
    def spotify(self):
        if self._needs_refresh():
            self._refresh()
        return self._spotify


_cache = StatusCache(ttl=30)


def _make_progress_bar(percent, width=10):
    blocks = [" ", "\u258f", "\u258e", "\u258d", "\u258c", "\u258b", "\u258a", "\u2589", "\u2588"]
    bar = ""
    full = int(percent * width)
    remainder = int((percent * width - full) * (len(blocks) - 1))
    for i in range(width):
        if i < full:
            bar += blocks[-1]
        elif i == full:
            bar += blocks[remainder]
        else:
            bar += blocks[0]
    return bar


def _get_process_name(tab):
    """Extract process name from the active window in a tab."""
    if tab.active_window and tab.active_window.child:
        cmdline = tab.active_window.child.cmdline
        if cmdline:
            name = os.path.basename(cmdline[0])
            return name
    return "zsh"


def _get_cwd(tab):
    """Get current working directory for a tab."""
    if tab.active_window:
        cwd = tab.active_window.cwd_of_child
        if cwd:
            home = os.path.expanduser("~")
            if cwd == home:
                return "~"
            return os.path.basename(cwd)
    return "~"


def _draw_right_status(screen, is_last):
    """Draw the right-side status area on the last tab's right edge."""
    if not is_last:
        return 0

    cells = []

    # Battery
    bat = _cache.battery
    if bat:
        cells.append((BATTERY_LOW if _cache.battery_is_low else BATTERY_COLOR, bat))
        cells.append((SEPARATOR_COLOR, " \u2502 "))

    # Spotify
    spot = _cache.spotify
    if spot:
        parts = spot.split("|")
        if len(parts) == 4:
            track, artist, dur_str, pos_str = parts
            if track and artist:
                if len(artist) > 15:
                    artist = artist[:12] + "\u2026"
                if len(track) > 20:
                    track = track[:17] + "\u2026"
                cells.append((TIME_COLOR, f"\u266a "))
                cells.append((DATE_COLOR, f"{artist} "))
                cells.append((INACTIVE_FG, f"- "))
                cells.append((DATE_COLOR, f"{track} "))
                cells.append((SEPARATOR_COLOR, "\u2502 "))

    # Date & Time
    now = datetime.now()
    date_str = now.strftime("%a %d %b")
    time_str = now.strftime("%H:%M")
    cells.append((DATE_COLOR, f" {date_str}  "))
    cells.append((TIME_COLOR, f"\U000f0954 {time_str} "))  # 󰥔

    # Calculate total width
    total_width = sum(len(text) for _, text in cells if text and not str(_).startswith("bg:") and _ != "reset")

    return total_width, cells


def draw_tab(
    draw_data: DrawData,
    screen: Screen,
    tab: TabBarData,
    before: int,
    max_tab_length: int,
    index: int,
    is_last: bool,
    extra_data: ExtraData,
) -> int:
    """Draw a single tab in the tab bar."""
    orig_bg = screen.cursor.bg
    orig_fg = screen.cursor.fg

    is_active = tab.is_active

    # Set tab colors
    if is_active:
        screen.cursor.bg = as_rgb(ACTIVE_BG)
        screen.cursor.fg = as_rgb(ACTIVE_FG)
    else:
        screen.cursor.bg = as_rgb(INACTIVE_BG)
        screen.cursor.fg = as_rgb(INACTIVE_FG)

    # Get tab info
    boss = get_boss()
    kitty_tab = None
    if boss:
        for os_window in boss.os_window_map.values() if hasattr(boss, 'os_window_map') else []:
            pass
        # Get the actual tab object for process info
        for t in boss.all_tabs:
            if t.id == tab.tab_id:
                kitty_tab = t
                break

    process_name = "zsh"
    display_name = "~"
    if kitty_tab:
        process_name = _get_process_name(kitty_tab)
        if process_name in ("zsh", "bash", "fish"):
            display_name = _get_cwd(kitty_tab)
        else:
            display_name = process_name

    # Truncate long names
    max_length = 18
    if len(display_name) > max_length:
        display_name = display_name[: max_length - 1] + "\u2026"

    # Workspace digit icon
    digit_icon = DIGIT_ICONS[index] if index < len(DIGIT_ICONS) else DIGIT_ICONS[0]

    # Process icon
    icon = ICONS.get(process_name, DEFAULT_ICON)

    # Draw: " [digit] [icon] [name] "
    tab_text = f" {digit_icon} "
    screen.draw(tab_text)

    # Icon with special color
    if is_active:
        screen.cursor.fg = as_rgb(ACTIVE_ICON)
    else:
        screen.cursor.fg = as_rgb(INACTIVE_ICON)
    screen.draw(icon)

    # Reset to tab text color
    if is_active:
        screen.cursor.fg = as_rgb(ACTIVE_FG)
    else:
        screen.cursor.fg = as_rgb(INACTIVE_FG)
    screen.draw(f" {display_name} ")

    end = screen.cursor.x

    # Draw right status on the last tab
    if is_last:
        try:
            result = _draw_right_status(screen, is_last)
            if result:
                total_width, cells = result
                # Position cursor for right-aligned status
                right_start = screen.columns - total_width - 1
                if right_start > end:
                    # Fill gap with bar background
                    screen.cursor.bg = as_rgb(_get_bar_bg())
                    screen.cursor.fg = as_rgb(_get_bar_bg())
                    screen.draw(" " * (right_start - end))

                    # Draw status cells
                    screen.cursor.bg = as_rgb(_get_bar_bg())
                    for color, text in cells:
                        if text is None:
                            continue
                        if isinstance(color, int):
                            screen.cursor.fg = as_rgb(color)
                            screen.draw(text)
                    end = screen.cursor.x
        except Exception:
            pass

    # Reset
    screen.cursor.bg = as_rgb(_get_bar_bg())
    screen.cursor.fg = orig_fg

    return end

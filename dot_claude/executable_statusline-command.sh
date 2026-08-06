#!/bin/bash

# claude code status bar that shows:
# - current directory
# - git branch & clean/dirty status
# - current session cost (in $, inferred if on subscription)
# - current model
# - context usage as a bar and pct
# - usage and pacing target for 5 hour subscription usage window
# - usage and pacing target for 7 day subscription usage window
# - current time (disabled)
# you can rearrange these items at the bottom if you desire

# Read Claude Code context from stdin
input=$(cat)

# linux and macos supported
[[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]] || (echo "Unsupported OS!" && exit)

# Extract information from Claude Code context
model_name=$(echo "$input" | jq -r '.model.display_name // "Claude"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // ""')
output_style=$(echo "$input" | jq -r '.output_style.name // "default"')
context_pct=$(echo "$input" | jq -r '.context_window.used_percentage // 10' | cut -d. -f1)
context_tokens=$(echo "$input" | jq -r '(.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0)')
context_k="$(( (context_tokens + 500) / 1000 ))k"
session_cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
session_cost="$(printf '$%.1f' $session_cost)"
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')
lines_info=""
if (( lines_added > 0 || lines_removed > 0 )); then
  lines_info="\033[32m+${lines_added}\033[0m \033[31m-${lines_removed}\033[0m"
fi
current_time=$(date '+%I:%M %p') # time in 12-hour format (no seconds)

# Get username and hostname
user=$(whoami)
host=$(hostname -s)

# Get short path for display (last 2 components, with $HOME → ~)
cwd_for_display="${current_dir:-$(pwd)}"
dir_name=$(echo "$cwd_for_display" | sed "s|^$HOME|~|" | awk -F'/' '{
    n = NF;
    if (n <= 2) {
        print $0
    } else {
        printf "%s/%s", $(n-1), $n
    }
}')

color_for_pct() {
  local pct=$1
  if [ "$pct" -ge 70 ]; then
    printf "\033[0;91m" # bright red
  elif [ "$pct" -ge 45 ]; then
    printf "\033[0;33m" # yellow
  else
    printf "\033[2;32m" # dim, green
  fi
}

# Bar with optional target marker (│) showing where even pacing would be.
# Uses fractional blocks for more precision on pct. Draws target_pct in the right block-interval.
# filled portion is colored, non-filled is dimmed & not colored
# Usage: make_bar <pct> [color_code] [target_pct] [width=10]
make_bar() {
  local pct=$1
  local color=$2
  local target=${3:-}
  local width=${4:-10}

  # Unicode fractional blocks
  local blocks=( "" ▏ ▎ ▍ ▌ ▋ ▊ ▉ )

  # progress in 1/8 cells
  local subcells=$((width * 8))
  local filled=$((pct * subcells / 100))
  local full=$((filled / 8))
  local rem=$((filled % 8))

  # optional pacing marker
  local target_pos=-1
  if [[ -n "$target" && "$target" =~ ^[0-9]+$ ]]; then
    target_pos=$((target * width / 100)) # takes floor of value
    ((target_pos >= width)) && target_pos=$((width-1)) # (applies if target>=100) => value in 0..width-1
  fi

  local bar=""
  for ((i=0;i<width;i++)); do
    # draw marker at target boundary
    if ((i == target_pos)); then
      #bar+="\033[0m│" # grey target bar
      bar+="\033[22;1;37m│" # bright white target bar
    elif ((i < full)); then
      bar+="${color}█"
    elif ((i == full)); then
      bar+="${color}${blocks[$rem]}"
    else
      bar+="\033[0;2m░"
    fi
  done

  printf "%s" "$bar"
}

if [ "$context_tokens" -ge 120000 ]; then
  CTX_COLOR="\033[0;91m"
elif [ "$context_tokens" -ge 90000 ]; then
  CTX_COLOR="\033[0;33m"
else
  CTX_COLOR="\033[2;32m"
fi
ctx_bar_pct=$((context_tokens * 100 / 150000))
[ "$ctx_bar_pct" -gt 100 ] && ctx_bar_pct=100
CTX_BAR=$(make_bar "$ctx_bar_pct" "$CTX_COLOR" "" 8)

# --- Usage limits (5-hour and 7-day) from Anthropic API ---

USAGE_CACHE="/tmp/claude-statusline-usage.json"
USAGE_CACHE_AGE=180 # refresh every 180 seconds max; don't do more often

fetch_usage() {
  local creds token response

  if [[ "$OSTYPE" == "darwin"* ]]; then
    creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || return 1
  else
    creds=$(<~/.claude/.credentials.json)
  fi

  token=$(echo "$creds" | jq -r '.claudeAiOauth.accessToken') || return 2
  [ -z "$token" ] || [ "$token" = "null" ] && return 3

  response=$(curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" \
    -H "Authorization: Bearer $token" \
    -H "anthropic-beta: oauth-2025-04-20" \
    -H "Content-Type: application/json" 2>/dev/null) || return 4

  # Check for errors
  if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
    return 5
  fi

  echo "$response" > "$USAGE_CACHE"
}

# Refresh cache if stale or missing
if [ ! -f "$USAGE_CACHE" ] || [ $(($(date +%s) - $(stat -c%Y "$USAGE_CACHE" 2>/dev/null || echo 0))) -gt $USAGE_CACHE_AGE ]; then
  fetch_usage 2>/dev/null
fi

# Read cached usage data and calculate pacing targets
usage_5h=""
usage_7d=""
target_5h=""
target_7d=""

if [ -f "$USAGE_CACHE" ]; then
  usage_5h=$(jq -r '.five_hour.utilization // empty' "$USAGE_CACHE" 2>/dev/null | cut -d. -f1)
  usage_7d=$(jq -r '.seven_day.utilization // empty' "$USAGE_CACHE" 2>/dev/null | cut -d. -f1)

  # Calculate pacing targets: how far through each window are we?
  NOW_EPOCH=$(date +%s)

  # 5-hour window target
  resets_5h=$(jq -r '.five_hour.resets_at // empty' "$USAGE_CACHE" 2>/dev/null)
  if [ -n "$resets_5h" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      reset_epoch=$(date -juf "%Y-%m-%dT%H:%M:%S" "$(echo "$resets_5h" | cut -d. -f1 | sed 's/+.*//')" +%s 2>/dev/null || date -d "$resets_5h" +%s 2>/dev/null)
    else
      reset_epoch=$(date -ud $resets_5h +%s 2>/dev/null)
    fi

    if [ -n "$reset_epoch" ]; then
      window_secs=$((5 * 3600)) # 5 hours
      window_secs_2=$((window_secs / 2))
      start_epoch=$((reset_epoch - window_secs))
      elapsed=$((NOW_EPOCH - start_epoch))
      [ "$elapsed" -lt 0 ] && elapsed=0
      [ "$elapsed" -gt "$window_secs" ] && elapsed=$window_secs
      target_5h=$(( (elapsed * 100 + window_secs_2) / window_secs)) # round with half-up trick

      # epochs seem to always end on the hour, but sometimes the time says 1:59 rather than 2:00; just showing the hour won't work. Round:
      if [[ "$OSTYPE" == "darwin"* ]]; then
        resets_5h_label=$(date -r "$(( (reset_epoch + 1800) / 3600 * 3600 ))" '+%-l%p' | tr '[:upper:]' '[:lower:]' | tr -d ' .')
      else
        resets_5h_label=$(date -d "@$(( (reset_epoch + 1800) / 3600 * 3600 ))" +%-Hh)
      fi
    fi
  fi

  # 7-day window target
  resets_7d=$(jq -r '.seven_day.resets_at // empty' "$USAGE_CACHE" 2>/dev/null)
  if [ -n "$resets_7d" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      reset_epoch=$(date -juf "%Y-%m-%dT%H:%M:%S" "$(echo "$resets_7d" | cut -d. -f1 | sed 's/+.*//')" +%s 2>/dev/null || date -d "$resets_7d" +%s 2>/dev/null)
    else
      reset_epoch=$(date -ud $resets_7d +%s 2>/dev/null)
    fi

    if [ -n "$reset_epoch" ]; then
      window_secs=$((7 * 86400))
      window_secs_2=$((window_secs / 2))
      start_epoch=$((reset_epoch - window_secs))
      elapsed=$((NOW_EPOCH - start_epoch))
      [ "$elapsed" -lt 0 ] && elapsed=0
      [ "$elapsed" -gt "$window_secs" ] && elapsed=$window_secs
      target_7d=$(( (elapsed * 100 + window_secs_2) / window_secs)) # round with half-up trick

      if [[ "$OSTYPE" == "darwin"* ]]; then
        resets_7d_label=$(date -r "$(( (reset_epoch + 1800) / 3600 * 3600 ))" '+%a, %-l%p' | tr '[:upper:]' '[:lower:]' | tr -d '.' | sed 's/ //2')
      else
        resets_7d_label=$(date -d "@$(( (reset_epoch + 1800) / 3600 * 3600 ))" '+%a:%-kh')
      fi
    fi
  fi
fi

# Build usage parts
usage_parts=""

if [ -n "$usage_5h" ]; then
  U5_COLOR=$(color_for_pct "$usage_5h")
  U5_BAR=$(make_bar "$usage_5h" "$U5_COLOR" "$target_5h" 8)
  reset_label=""
  [ -n "$resets_5h_label" ] && reset_label=" ➞ ${resets_5h_label}"
  usage_parts="${U5_COLOR}5hr${reset_label} ${U5_BAR} ${usage_5h}%\033[0m"
fi

if [ -n "$usage_7d" ]; then
  U7_COLOR=$(color_for_pct "$usage_7d")
  U7_BAR=$(make_bar "$usage_7d" "$U7_COLOR" "$target_7d" 8)
  reset_7d_label_str=""
  [ -n "$resets_7d_label" ] && reset_7d_label_str=" ➞ ${resets_7d_label}"
  [ -n "$usage_parts" ] && usage_parts="${usage_parts}\033[2m │ \033[0m"
  usage_parts="${usage_parts}${U7_COLOR}wk${reset_7d_label_str} ${U7_BAR}\033[0m" # removed ${usage_7d}%
fi

# Single line output
line=""

# line 1: current path
line+="\033[1;35m${dir_name}\033[0m\n"

# line 2: context + usage + lines + cost
line+="${CTX_COLOR}ctx ${CTX_BAR} ${context_k}\033[0m"

if [ -n "$usage_parts" ]; then
  line+="\033[2m │ \033[0m${usage_parts}"
fi

if [ -n "$lines_info" ]; then
  line+="\033[2m │ \033[0m${lines_info} \033[2m::\033[0m ${session_cost}"
else
  line+="\033[2m │ \033[0m${session_cost}"
fi

# current time
#line+=" | ${current_time}"

echo -e "$line"

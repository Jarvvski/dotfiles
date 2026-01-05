# Interactive khal event browser with fzf
function kf() {
  local days=${1:-30}
  khal list --format "{start-date} {start-time} {title}" now ${days}d | \
    fzf --preview 'echo {}' --preview-window=up:3:wrap
}

# Browse and search all events
function ks() {
  khal search "${1:-}" | \
    fzf --preview 'echo {}' --preview-window=up:3:wrap
}

# Quick calendar overview with fzf
function kv() {
  local selected_date
  selected_date=$(seq 0 30 | while read days; do
    local day_name=$(date -v+${days}d "+%A")
    local date_str=$(date -v+${days}d "+%Y-%m-%d")
    local events=$(khal list "$date_str" "$date_str" 2>/dev/null | tr '\n' ' ')
    printf "%-10s\t%s\t%s\n" "$day_name" "$date_str" "$events"
  done | fzf --preview 'khal list {2} 2d' --height 80% | awk '{print $2}')

  if [[ -n "$selected_date" ]]; then
    khal list "$selected_date" 2d
  fi
}

# Interactive calendar view
alias kk='khal interactive'

# Calendar view with today's events
alias kt='khal list today today --day-format "{name} {date}"'

# Interactive day browser - inline with fzf
function ki() {
  local today=$(date "+%Y-%m-%d")
  local selected_date
  local -a dates

  # Generate dates
  for offset in {-5..15}; do
    local date_cmd="date"
    if [[ $offset -gt 0 ]]; then
      date_cmd="date -v+${offset}d"
    elif [[ $offset -lt 0 ]]; then
      local abs=$((offset * -1))
      date_cmd="date -v-${abs}d"
    fi

    local day_name=$(eval "$date_cmd '+%A'")
    local date_str=$(eval "$date_cmd '+%Y-%m-%d'")

    if [[ "$date_str" == "$today" ]]; then
      dates+=("$(printf '%-10s\t%s (Today)' "$day_name" "$date_str")")
    else
      dates+=("$(printf '%-10s\t%s' "$day_name" "$date_str")")
    fi
  done

  selected_date=$(printf '%s\n' "${dates[@]}" | fzf --height 60% \
    --preview 'khal list {2} {2}' \
    --preview-window=right:60%:wrap \
    --header "Use ↑↓ to navigate days, Enter to create event" \
    --no-sort \
    +m | awk '{print $2}')

  if [[ -n "$selected_date" ]]; then
    echo "Selected date: $selected_date"
    vared -p "Event title: " -c event_title
    if [[ -n "$event_title" ]]; then
      vared -p "Start time (HH:MM): " -c start_time
      vared -p "End time (HH:MM or duration like 1h): " -c end_time
      if khal new "$selected_date" "$start_time" "$end_time" "$event_title"; then
        # Spinner animation
        local spin='|/-\'
        local i=0
        printf "Syncing to Google Calendar... "
        {
          vdirsyncer sync &>/dev/null
        } &
        local sync_pid=$!
        disown
        while kill -0 $sync_pid 2>/dev/null; do
          i=$(( (i+1) %4 ))
          printf "\b${spin:$i:1}"
          sleep 0.1
        done
        wait $sync_pid 2>/dev/null
        printf "\b✓\n"
      fi
    fi
  fi
}

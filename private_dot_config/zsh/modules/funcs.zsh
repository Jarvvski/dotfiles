function gdub() {
    git fetch --all --prune;
    for branch in $(git branch -vv | grep ': gone]' | awk '{print $1}');
    do
        git branch -D $branch;
    done;
}

function fuckidea() {
  find ./ -type f \( -iname \*.iml -o -iname \*.iws -o -iname \*.ipr \) -exec rm -f {} \;
  echo -e "\e[36midea has been \e[3m\e[95mfucked\e[0m\e[39m"
}

function gsqb() {
  defaultBranch=$(git config --get init.defaultBranch || echo main)
  git reset $(git merge-base $defaultBranch $(git branch --show-current))
  git add -A
  git commit -S --no-verify
  git push --force-with-lease
}

function idea() {
    open -a "IntelliJ IDEA Ultimate" "$1"
}

function timezsh() {
  shell=${1-$SHELL}
  for i in $(seq 1 10); do /usr/bin/time $shell -i -c exit; done
}

function mktouch() {
    mkdir -p $(dirname $1) && touch $1;
}

function b64d() {
  echo "$1" | base64 -d ; echo
}

function b64e() {
  echo "$1" | base64 ; echo
}

function uuid() {
  uuidgen | tr -d '\n' | pbcopy
}

function flook() {
  local file
  file=$(fzf --preview="bat --style=numbers --color=always {}")
  [[ -n "$file" ]] && code "$file"
}

function monitor() {
  if [[ $# -ne 1 ]]; then
    echo "Usage: monitor /path/to/file"
    return 1
  fi

  local FILE_PATH="$1"

  if [[ ! -e "$FILE_PATH" ]]; then
    echo "Error: File '$FILE_PATH' does not exist"
    return 1
  fi

  echo "Starting to monitor: $FILE_PATH"
  echo "Press Ctrl+C to stop monitoring"
  echo "========================================"

  # Check required tools
  if ! command -v fswatch &> /dev/null; then
    echo "Error: fswatch is not installed"
    echo "Install it with: brew install fswatch"
    return 1
  fi

  # Method 1: Use continuous monitoring with fswatch + lsof
  if [[ "$2" != "--dtrace" ]]; then
    # Create a background process that continuously monitors file access
    # This increases our chance of catching the process
    (
      while true; do
        lsof "$FILE_PATH" 2>/dev/null | awk 'NR>1 {print $1,$2,$3,$9}' >> /tmp/file_monitors_$.log
        sleep 0.1
      done
    ) &
    MONITOR_PID=$!

    # Make sure we kill our background process when this function exits
    trap "kill $MONITOR_PID 2>/dev/null; rm -f /tmp/file_monitors_$.log; echo 'Monitoring stopped.'" EXIT INT TERM

    fswatch -o "$FILE_PATH" | while read -r file
    do
      echo "\n[$(date +"%Y-%m-%d %H:%M:%S")] Change detected to $file"

      # Use lsof to check processes with the file open right now
      echo "\nProcesses with file open now:"
      lsof "$FILE_PATH" 2>/dev/null || echo "None found at this exact moment"

      # Show unique processes that accessed the file since we started monitoring
      echo "\nProcesses that accessed the file since monitoring began:"
      if [[ -f /tmp/file_monitors_$.log ]]; then
        cat /tmp/file_monitors_$.log | sort | uniq || echo "None detected"
      else
        echo "No log file found"
      fi

      echo "\n----------------------------------------"
    done
  else
    # Method 2: Use DTrace for deeper system monitoring (requires sudo)
    echo "Using DTrace for advanced monitoring (requires sudo)"
    echo "This will show ALL processes that open the file"
    sudo dtrace -qn '
      syscall::open*:entry,syscall::write*:entry,syscall::read*:entry
      /execname != "" && stringof(arg0) == "'$FILE_PATH'" ||
       execname != "" && fds[arg0].fi_pathname == "'$FILE_PATH'"/
      {
        printf("%Y: %s(pid %d) %s %s\n", walltimestamp, execname, pid, probefunc,
        (probefunc == "open" || probefunc == "openat") ? stringof(arg0) : fds[arg0].fi_pathname);
      }
    '
  fi
}

# Kill process on a specific port
function killport() {
  if [[ -z "$1" ]]; then
    echo "Usage: killport <port>"
    return 1
  fi
  local pid=$(lsof -ti:$1)
  if [[ -n "$pid" ]]; then
    kill -9 $pid
    echo "Killed process on port $1 (PID: $pid)"
  else
    echo "No process found on port $1"
  fi
}

# Extract various archive formats
function extract() {
  if [[ ! -f "$1" ]]; then
    echo "File not found: $1"
    return 1
  fi
  case "$1" in
    *.tar.bz2) tar xjf "$1" ;;
    *.tar.gz)  tar xzf "$1" ;;
    *.tar.xz)  tar xJf "$1" ;;
    *.bz2)     bunzip2 "$1" ;;
    *.rar)     unrar x "$1" ;;
    *.gz)      gunzip "$1" ;;
    *.tar)     tar xf "$1" ;;
    *.tbz2)    tar xjf "$1" ;;
    *.tgz)     tar xzf "$1" ;;
    *.zip)     unzip "$1" ;;
    *.Z)       uncompress "$1" ;;
    *.7z)      7z x "$1" ;;
    *) echo "Unknown archive format: $1" ;;
  esac
}

# Quick note taker (creates dated markdown files)
function note() {
  local note_dir="$HOME/.notes"
  local note_file="$note_dir/$(date +%Y-%m-%d).md"
  mkdir -p "$note_dir"

  if [[ -n "$*" ]]; then
    echo -e "\n## $(date +%H:%M) - $*" >> "$note_file"
  fi

  ${EDITOR:-vim} "$note_file"
}

# Quick project opener with fzf
function proj() {
  local project_dirs=(
    "$HOME/projects"
    "$HOME/work"
    "$HOME/code"
    "$HOME/src"
  )

  # Find directories 2 levels deep in project directories
  local selected=$(fd -t d -d 2 . "${project_dirs[@]}" 2>/dev/null | fzf --height 40% --reverse)

  if [[ -n "$selected" ]]; then
    cd "$selected" && ls
  fi
}

# Git worktree switcher with fzf
function gwt() {
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Not in a git repository"
    return 1
  fi

  local worktree=$(git worktree list | fzf --height 40% --reverse | awk '{print $1}')

  if [[ -n "$worktree" ]]; then
    cd "$worktree"
  fi
}

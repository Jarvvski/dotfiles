# <<<<< Enable natural text editing
export WORDCHARS='*?_-.[]~&;!#$%^(){}<>'

# Set Emacs mode key bindings
bindkey -e

# Move cursor to the beginning and end of the line
# These now work via WezTerm sending Ctrl-A and Ctrl-E
bindkey '^A' beginning-of-line      # Ctrl-A (sent by Cmd+Left and Shift+Left)
bindkey '^E' end-of-line            # Ctrl-E (sent by Cmd+Right and Shift+Right)

# Move by words (opt + Left/Right Arrows)
bindkey "^[b" backward-word # ⌥← (Alt-b)
bindkey "^[f" forward-word # ⌥→ (Alt-f)

# Delete one word backwards (opt + Backspace)
bindkey '^W' backward-kill-word

# Delete forward and backward
bindkey '^?' backward-delete-char   # Backspace (delete backward)
bindkey '^[[3~' delete-char         # Delete (delete forward)

# Cut, copy, and paste behavior
bindkey '^K' kill-line              # Ctrl-K: Cut the rest of the line
bindkey '^U' backward-kill-line     # Ctrl-U: Cut everything before the cursor
bindkey '^Y' yank                   # Ctrl-Y: Paste the last cut text

# Undo last change (Cmd + Z sends Ctrl-_)
bindkey '^_' undo

# Enable natural text editing >>>>>

# <<<<< Enable natural text editing
export WORDCHARS='*?_-.[]~&;!#$%^(){}<>'

# Set Emacs mode key bindings
bindkey -e

# Move cursor to the beginning and end of the line (Cmd + Left/Right)
bindkey '^[[1;3D^' beginning-of-line    # Cmd + Left Arrow
bindkey '^[[1;3D^' end-of-line          # Cmd + Right Arrow

# Move by words (opt + Left/Right Arrows)
bindkey "\e[1;3D" backward-word # ⌥←
bindkey "\e[1;3C" forward-word # ⌥→
# Delete one word backwards (opt + Backspace)
bindkey '^W' backward-kill-word

# Delete forward and backward (Option + Delete)
bindkey '^?' backward-delete-char   # Backspace (delete backward)
bindkey '^[[3~' delete-char         # Delete (delete forward)

# Cut, copy, and paste behavior similar to macOS (Cmd + X, Cmd + C, Cmd + V)
bindkey '^K' kill-line              # Cmd + K: Cut the rest of the line
bindkey '^U' backward-kill-line     # Cmd + U: Cut everything before the cursor
bindkey '^Y' yank                   # Cmd + V: Paste the last cut text

# Undo last change (Cmd + Z)
bindkey '^Z' undo

# Enable natural text editing >>>>>

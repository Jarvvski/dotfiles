if application "Spotify" is running then
  tell application "Spotify"
    if player state is playing then
      set trackName to name of current track
      set artistName to artist of current track
      set trackDuration to duration of current track -- in ms
      set trackPosition to player position -- in seconds
      return trackName & "|" & artistName & "|" & trackDuration & "|" & (trackPosition * 1000)
    else
      return ""
    end if
  end tell
else
  return ""
end if
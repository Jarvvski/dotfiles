# Used for test containers in intellij
export DOCKER_HOST=unix://${XDG_CONFIG_HOME}/colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock

# Testcontainers needs the colima VM address, but `colima ls -j` costs ~0.3s
# per shell. Read a cached value at startup and refresh it in the background.
_colima_addr_cache="${XDG_CACHE_HOME:-$HOME/.cache}/colima-address"
[[ -r "$_colima_addr_cache" ]] && export TESTCONTAINERS_HOST_OVERRIDE="$(<"$_colima_addr_cache")"
: "${TESTCONTAINERS_HOST_OVERRIDE:=localhost}"
export TESTCONTAINERS_HOST_OVERRIDE

_colima_refresh_addr() {
  local addr
  addr=$(colima ls -j 2>/dev/null | jq -r '.address // "localhost"' 2>/dev/null)
  [[ -n "$addr" ]] && print -r -- "$addr" >| "$_colima_addr_cache"
}
if (( $+functions[zsh-defer] )); then
  zsh-defer _colima_refresh_addr
else
  _colima_refresh_addr
fi

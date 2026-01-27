# Used for test containers in intellij
export DOCKER_HOST=unix://${XDG_CONFIG_HOME}/colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
export TESTCONTAINERS_HOST_OVERRIDE=$(colima ls -j 2>/dev/null | jq -r '.address // empty' 2>/dev/null)
: "${TESTCONTAINERS_HOST_OVERRIDE:=localhost}"

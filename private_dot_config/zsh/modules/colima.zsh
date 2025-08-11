# Used for test containers in intellij
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
# export TESTCONTAINERS_HOST_OVERRIDE=$(colima ls -j | jq -r '.address')
export TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1
# export TESTCONTAINERS_RYUK_DISABLED=true
# export DOCKER_HOST="unix://${HOME}/.config/colima/default/docker.sock"

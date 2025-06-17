# setup to use .config
export ASDF_DATA_DIR="${XDG_DATA_HOME}/asdf"
export ASDF_CONFIG_FILE="${XDG_CONFIG_HOME}/asdf/asdfrc"
source "${ASDF_DATA_DIR}/plugins/java/set-java-home.zsh"
export PATH="$ASDF_DATA_DIR/shims:$PATH"
export ASDF_GOLANG_MOD_VERSION_ENABLED=true

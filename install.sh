#!/bin/sh
# install.sh - the WilsonWorks Workspace bootstrap for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/wilson-works/workspace/main/install.sh | sh -s -- --dry-run
#   sh install.sh [any install.js option]
#
# What it does, in order:
#   1. checks git and Node.js 20 or newer, and says how to get whichever is missing (brew, or the
#      download page);
#   2. picks the Hub: $WW_HUB, else ~/Hub;
#   3. clones $WW_SOURCE (default https://github.com/wilson-works/workspace.git) at branch $WW_REF
#      (default main) into <Hub>/50-AI/workspace, unless it is there already; then it runs
#      "git pull --ff-only" only when that copy has no changes of yours;
#   4. runs node <Hub>/50-AI/workspace/install.js --hub <Hub>, passing on every option, with the
#      keyboard attached when there is one (under "curl | sh" the script itself is on stdin).
# --dry-run writes nothing: a temporary copy shows the installer's plan and is deleted after.
# The exit code is install.js's: 0 done, 1 failed, 2 refused.
# Everything is inside functions called on the last line, so a download cut short runs nothing.

ww_run() {
  ww_dir="$1"; ww_hub="$2"; shift 2
  if [ -t 0 ]; then
    node "$ww_dir/install.js" --hub "$ww_hub" "$@"
  elif (: </dev/tty) 2>/dev/null; then
    node "$ww_dir/install.js" --hub "$ww_hub" "$@" </dev/tty
  else
    node "$ww_dir/install.js" --hub "$ww_hub" "$@" </dev/null
  fi
}

ww_main() {
  source_url="${WW_SOURCE:-https://github.com/wilson-works/workspace.git}"
  ref="${WW_REF:-main}"
  hub="${WW_HUB:-$HOME/Hub}"
  dry=0
  for a in "$@"; do
    if [ "$a" = "--dry-run" ]; then dry=1; fi
  done

  if ! command -v git >/dev/null 2>&1; then
    echo "Git is not installed."
    if [ "$(uname -s)" = "Darwin" ]; then
      echo "Install it with:  xcode-select --install    (or: brew install git)"
    else
      echo "Install it with your package manager, for example:  sudo apt install git"
    fi
    echo "or download it from https://git-scm.com/downloads. Then run this again."
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed."
    if [ "$(uname -s)" = "Darwin" ]; then echo "Install it with:  brew install node"; fi
    echo "or download the LTS from https://nodejs.org. Then run this again."
    return 1
  fi
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -lt 20 ] 2>/dev/null; then
    echo "Node.js $(node --version) is too old: version 20 or newer is needed. Get the LTS from https://nodejs.org"
    return 1
  fi

  ws="$hub/50-AI/workspace"
  if [ -e "$ws/.git" ]; then
    if [ -n "$(git -C "$ws" status --porcelain 2>/dev/null)" ]; then
      echo "= $ws has changes of yours, so it is not updated."
    elif [ "$dry" = 1 ]; then
      echo "~ $ws would be updated (git pull --ff-only)."
    else
      echo "Updating $ws"
      git -C "$ws" pull --ff-only || echo "Could not update it; going on with the copy you have."
    fi
    ww_run "$ws" "$hub" "$@"
    return $?
  fi
  if [ -e "$ws" ]; then
    echo "There is already a folder at $ws, and it is not a copy of the workspace."
    echo "Move it somewhere else, or set WW_HUB to another folder, then run this again."
    return 2
  fi

  if [ "$dry" = 1 ]; then
    tmp=$(mktemp -d 2>/dev/null || mktemp -d -t ww-dry-run)
    echo "+ $source_url ($ref) would be cloned into $ws"
    echo "  (dry run: a temporary copy shows the installer's plan, and is deleted after)"
    if git clone -q --branch "$ref" "$source_url" "$tmp/workspace"; then
      ww_run "$tmp/workspace" "$hub" "$@"
      code=$?
    else
      echo "Could not download the workspace from $source_url."
      code=1
    fi
    rm -rf "$tmp"
    return $code
  fi

  mkdir -p "$hub/50-AI" || return 1
  echo "Downloading the workspace into $ws"
  if ! git clone --branch "$ref" "$source_url" "$ws"; then
    echo "Could not download the workspace from $source_url."
    return 1
  fi
  ww_run "$ws" "$hub" "$@"
}

ww_main "$@"

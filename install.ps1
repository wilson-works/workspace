# install.ps1 - the WilsonWorks Workspace bootstrap for Windows (Windows PowerShell 5.1 or newer).
#
#   irm https://raw.githubusercontent.com/wilson-works/workspace/main/install.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File install.ps1 [any install.js option, for example --dry-run]
#
# What it does, in order:
#   1. checks git and Node.js 20 or newer, and says how to get whichever is missing (winget, or the
#      download page);
#   2. picks the Hub: $env:WW_HUB, else <your user folder>\Hub;
#   3. clones $env:WW_SOURCE (default https://github.com/wilson-works/workspace.git) at branch
#      $env:WW_REF (default main) into <Hub>\50-AI\workspace, unless it is there already; then it
#      runs "git pull --ff-only" only when that copy has no changes of yours;
#   4. runs node <Hub>\50-AI\workspace\install.js --hub <Hub>, passing on every option.
# "| iex" cannot pass options, so $env:WW_ARGS carries them:  $env:WW_ARGS = '--dry-run'; irm ... | iex
# --dry-run writes nothing: a temporary copy shows the installer's plan and is deleted after.
# It never closes your PowerShell window: through iex it returns; as a file it exits with
# install.js's code (0 done, 1 failed, 2 refused).

$WWExit = 0
& {
  $ErrorActionPreference = 'Continue'
  $rest = @($args)
  if ($env:WW_ARGS) { $rest += @($env:WW_ARGS -split '\s+' | Where-Object { $_ }) }
  $source = if ($env:WW_SOURCE) { $env:WW_SOURCE } else { 'https://github.com/wilson-works/workspace.git' }
  $ref = if ($env:WW_REF) { $env:WW_REF } else { 'main' }
  $userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
  $hub = if ($env:WW_HUB) { $env:WW_HUB } else { Join-Path $userHome 'Hub' }
  $dry = $rest -contains '--dry-run'

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host 'Git is not installed. Install it with:  winget install --id Git.Git -e'
    Write-Host 'or download it from https://git-scm.com/download/win'
    Write-Host 'Then open a new PowerShell window and run this again.'
    $script:WWExit = 1; return
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js is not installed. Install it with:  winget install --id OpenJS.NodeJS.LTS -e'
    Write-Host 'or download the LTS from https://nodejs.org'
    Write-Host 'Then open a new PowerShell window and run this again.'
    $script:WWExit = 1; return
  }
  $major = 0
  [void][int]::TryParse(((& node -p "process.versions.node.split('.')[0]") | Out-String).Trim(), [ref]$major)
  if ($major -lt 20) {
    Write-Host "Node.js $((& node --version) | Out-String) is too old: version 20 or newer is needed."
    Write-Host 'Update it with:  winget upgrade --id OpenJS.NodeJS.LTS -e   or from https://nodejs.org'
    $script:WWExit = 1; return
  }

  $ws = Join-Path $hub '50-AI\workspace'
  if (Test-Path (Join-Path $ws '.git')) {
    $dirty = (& git -C $ws status --porcelain | Out-String).Trim()
    if ($dirty) {
      Write-Host "= $ws has changes of yours, so it is not updated."
    } elseif ($dry) {
      Write-Host "~ $ws would be updated (git pull --ff-only)."
    } else {
      Write-Host "Updating $ws"
      & git -C $ws pull --ff-only
      if ($LASTEXITCODE -ne 0) { Write-Host 'Could not update it; going on with the copy you have.' }
    }
    & node (Join-Path $ws 'install.js') --hub $hub @rest
    $script:WWExit = $LASTEXITCODE; return
  }
  if (Test-Path $ws) {
    Write-Host "There is already a folder at $ws, and it is not a copy of the workspace."
    Write-Host 'Move it somewhere else, or set WW_HUB to another folder, then run this again.'
    $script:WWExit = 2; return
  }

  if ($dry) {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('ww-dry-run-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    Write-Host "+ $source ($ref) would be cloned into $ws"
    Write-Host '  (dry run: a temporary copy shows the installer''s plan, and is deleted after)'
    & git clone -q --branch $ref $source (Join-Path $tmp 'workspace')
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Could not download the workspace from $source."
      $script:WWExit = 1
    } else {
      & node (Join-Path $tmp 'workspace\install.js') --hub $hub @rest
      $script:WWExit = $LASTEXITCODE
    }
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    return
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $hub '50-AI') | Out-Null
  Write-Host "Downloading the workspace into $ws"
  & git clone --branch $ref $source $ws
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not download the workspace from $source."
    $script:WWExit = 1; return
  }
  & node (Join-Path $ws 'install.js') --hub $hub @rest
  $script:WWExit = $LASTEXITCODE
} @args
if ($PSCommandPath) { exit $WWExit }

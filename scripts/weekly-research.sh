#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/fpv-bando-map"
codex_bin="${BANDO_CODEX_BIN:-codex}"
mkdir -p "$state_dir"
exec 9>"$state_dir/research.lock"
flock -n 9 || exit 0

if [[ "${1:-}" == "--check" ]]; then
  command -v "$codex_bin" >/dev/null
  command -v npm >/dev/null
  command -v flock >/dev/null
  command -v node >/dev/null
  command -v git >/dev/null
  command -v timeout >/dev/null
  test -f "$project_dir/automation/weekly-prompt.md"
  printf '%s\n' 'Weekly research prerequisites OK; no model request was made.'
  exit 0
fi

cd "$project_dir"
if [[ "$(git branch --show-current)" != main || -n "$(git status --porcelain)" ]]; then
  printf '%s\n' 'Research skipped: the main checkout has unfinished work or is on another branch.'
  exit 0
fi
git fetch origin main
git merge --ff-only origin/main
baseline="$(git rev-parse HEAD)"
if [[ "$baseline" != "$(git rev-parse origin/main)" ]]; then
  printf '%s\n' 'Research skipped: local commits have not been pushed.'
  exit 0
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
worktree="$state_dir/worktrees/$stamp"
mkdir -p "$(dirname "$worktree")" "$state_dir/logs"
git worktree add --detach "$worktree" "$baseline"
# Keep failed runs for inspection. Remove a clean, completed worktree at the end.
if [[ -d "$project_dir/node_modules" ]]; then
  ln -s "$project_dir/node_modules" "$worktree/node_modules"
else
  npm ci --prefix "$worktree"
fi
printf 'Research worktree: %s\n' "$worktree"
timeout --signal=TERM --kill-after=30s 20m "$codex_bin" --no-daemon --search -a never exec \
  --sandbox workspace-write -c sandbox_workspace_write.network_access=true \
  --model gpt-6.1-sol -c model_reasoning_effort=medium \
  --cd "$worktree" --output-last-message "$state_dir/logs/$stamp-summary.md" - \
  < "$project_dir/automation/weekly-prompt.md" \
  > "$state_dir/logs/$stamp.log" 2>&1

cd "$worktree"
while IFS= read -r -d '' changed; do
  case "$changed" in
    src/atlas/data.json|src/data/atlas-links.json|public/research/youtube-netz.md|public/research/weekly-log.md) ;;
    *) printf 'Unexpected changed file; retained for review: %s\n' "$changed"; exit 1 ;;
  esac
done < <(git diff --name-only -z HEAD; git ls-files --others --exclude-standard -z)
npm run build
npm run format:check
if [[ -z "$(git status --porcelain)" ]]; then
  cd "$project_dir"
  git worktree remove "$worktree"
  exit 0
fi
git add src/atlas/data.json src/data/atlas-links.json public/research/youtube-netz.md public/research/weekly-log.md
git diff --cached --check
git commit -m "Update weekly FPV research ($stamp)"
result="$(git rev-parse HEAD)"

# Only advance the shared checkout if no one started working while research ran.
if [[ "$(git -C "$project_dir" branch --show-current)" != main || "$(git -C "$project_dir" rev-parse HEAD)" != "$baseline" || -n "$(git -C "$project_dir" status --porcelain)" ]]; then
  printf 'Research ready at %s in %s; main changed, so no automatic push.\n' "$result" "$worktree"
  exit 0
fi
git push origin HEAD:main
cd "$project_dir"
git merge --ff-only "$result"
npm run build
git worktree remove "$worktree"
printf 'Weekly research completed and pushed: %s\n' "$result"

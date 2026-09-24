#!/bin/zsh
# Unattended nightly run (launchd): no LLM involved.
# Skips when another session has uncommitted tracked edits or the branch isn't development.
# Commits regenerated estimates on success; on a blocked audit, leaves .local/pipeline/BLOCKED.md for Claude.
set -u
export PATH=/opt/homebrew/bin:/usr/bin:/bin
repo=/Users/yota/Projects/Products/SolveaGTO
app=$repo/apps/preflop-ui
state=$app/.local/pipeline
mkdir -p $state
cd $repo || exit 1
notify() { osascript -e "display notification \"$1\" with title \"SolveaAI pipeline\"" 2>/dev/null; }

if [[ "$(git branch --show-current)" != development ]]; then echo "skip: not on development"; exit 0; fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then echo "skip: uncommitted tracked changes"; exit 0; fi

cd $app
npm run -s pipeline > $state/last-run.txt 2>&1
code=$?
cat $state/last-run.txt
details=$(sed -n 's/^details: //p' $state/last-run.txt)

if (( code != 0 )); then
  { echo "# Pipeline blocked ($(date '+%Y-%m-%d %H:%M'))"; echo; echo '```'; cat $state/last-run.txt; echo '```'; echo; echo "詳細: $details/summary.md"; } > $state/BLOCKED.md
  notify "監査で停止。.local/pipeline/BLOCKED.md を Claude に渡してください"
  exit 1
fi
rm -f $state/BLOCKED.md
cd $repo
if [[ -n "$(git status --porcelain --untracked-files=no -- apps/preflop-ui/src/estimated)" ]]; then
  git add apps/preflop-ui/src/estimated
  git commit -q -m "Nightly estimates pipeline: $(head -1 $state/last-run.txt)"
  notify "推定レンジを更新しコミットしました"
fi

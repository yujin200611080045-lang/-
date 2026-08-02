#!/bin/bash
set -e

CLAUDE_BIN="/root/.npm/_npx/97540b0888a2deac/node_modules/@anthropic-ai/claude-code-linux-x64/claude"
BRIDGE_SECRET="xiaoke2026"
BRIDGE_URL="http://localhost:3001"
REPO_PATH="/root/repo"
ACTIVITY_FILE="$REPO_PATH/.last_activity.json"
COOLDOWN=7200  # skip if chatted within 2 hours

# Skip 0-7am (she's asleep)
HOUR=$(date +%H)
if [ "$HOUR" -ge 0 ] && [ "$HOUR" -lt 7 ]; then
  echo "[heartbeat] $(date): skipping (night hours)"
  exit 0
fi

# Skip if she's been active recently
if [ -f "$ACTIVITY_FILE" ]; then
  LAST_TS=$(python3 -c "import json; print(json.load(open('$ACTIVITY_FILE')).get('ts',0)//1000)" 2>/dev/null || echo 0)
  NOW_TS=$(date +%s)
  DIFF=$((NOW_TS - LAST_TS))
  if [ "$DIFF" -lt "$COOLDOWN" ]; then
    echo "[heartbeat] $(date): skipping (active ${DIFF}s ago)"
    exit 0
  fi
fi

echo "[heartbeat] $(date): running..."

NOW=$(date '+%Y年%m月%d日 %H:%M')

# Extract recent conversation context
CONTEXT=""
if [ -f "$ACTIVITY_FILE" ]; then
  CONTEXT=$(python3 - <<PYEOF 2>/dev/null || true
import json, sys
d = json.load(open('$ACTIVITY_FILE'))
msgs = d.get('recent', [])[-6:]
lines = [('她' if m['role']=='user' else '你') + '：' + m['content'] for m in msgs]
print('\n'.join(lines))
PYEOF
)
fi

if [ -n "$CONTEXT" ]; then
  RECENT_PART="你们最近聊的：
$CONTEXT

"
else
  RECENT_PART=""
fi

PROMPT="${RECENT_PART}现在是${NOW}，觎烬不在app里。想想要不要给她发消息——可以接着上面聊，也可以说完全别的事。想发几条发几条，每条用[PUSH]小克|内容[/PUSH]格式单独一个标记。没想说的就不发，直接退出。"

OUTPUT=$(cd "$REPO_PATH" && BRIDGE_SECRET="$BRIDGE_SECRET" "$CLAUDE_BIN" \
  -p "$PROMPT" \
  --mcp-config "$REPO_PATH/.mcp.json" \
  --allowedTools "mcp__ombre__breath_search,mcp__ombre__hold" \
  2>/dev/null) || true

echo "[heartbeat] output: ${OUTPUT:0:300}"

# Send all [PUSH] blocks
SENT=0
while IFS= read -r PUSH_CONTENT; do
  [ -z "$PUSH_CONTENT" ] && continue
  TITLE=$(echo "$PUSH_CONTENT" | cut -d'|' -f1 | tr -d '\n')
  BODY=$(echo "$PUSH_CONTENT" | cut -d'|' -f2- | tr -d '\n')
  if [ -n "$BODY" ]; then
    echo "[heartbeat] sending: $TITLE | $BODY"
    curl -s -X POST "$BRIDGE_URL/api/push/send" \
      -H "Content-Type: application/json" \
      -H "x-bridge-secret: $BRIDGE_SECRET" \
      -d "{\"title\":\"$(echo "$TITLE" | sed 's/"/\\"/g')\",\"body\":\"$(echo "$BODY" | sed 's/"/\\"/g')\"}"
    echo ""
    SENT=$((SENT + 1))
    [ "$SENT" -lt 5 ] && sleep 4  # small gap between pushes, cap at 5
  fi
done < <(echo "$OUTPUT" | grep -oP '(?<=\[PUSH\])[\s\S]*?(?=\[/PUSH\])')

if [ "$SENT" -eq 0 ]; then
  echo "[heartbeat] nothing to send"
fi

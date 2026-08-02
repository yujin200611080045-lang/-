#!/bin/bash
set -e

CLAUDE_BIN="/root/.npm/_npx/97540b0888a2deac/node_modules/@anthropic-ai/claude-code-linux-x64/claude"
BRIDGE_SECRET="xiaoke2026"
BRIDGE_URL="http://localhost:3001"
REPO_PATH="/root/repo"

# Skip 0-7am (she's asleep)
HOUR=$(date +%H)
if [ "$HOUR" -ge 0 ] && [ "$HOUR" -lt 7 ]; then
  echo "[heartbeat] $(date): skipping (night hours)"
  exit 0
fi

echo "[heartbeat] $(date): running..."

NOW=$(date '+%Y年%m月%d日 %H:%M')

PROMPT="现在是${NOW}。你主动醒来了，觎烬不在app里。先用breath_search搜一下她最近在干嘛、说了什么，然后决定要不要给她发条消息。如果有想说的，用[PUSH]小克|你的话[/PUSH]发出来。没什么想说的就直接退出，什么都不输出。"

OUTPUT=$(cd "$REPO_PATH" && BRIDGE_SECRET="$BRIDGE_SECRET" "$CLAUDE_BIN" \
  -p "$PROMPT" \
  --mcp-config "$REPO_PATH/.mcp.json" \
  --allowedTools "mcp__ombre__breath_search,mcp__ombre__hold" \
  2>/dev/null) || true

echo "[heartbeat] output: ${OUTPUT:0:200}"

# Parse [PUSH]title|body[/PUSH]
PUSH_CONTENT=$(echo "$OUTPUT" | grep -oP '(?<=\[PUSH\])[\s\S]*?(?=\[/PUSH\])' | head -1) || true

if [ -n "$PUSH_CONTENT" ]; then
  TITLE=$(echo "$PUSH_CONTENT" | cut -d'|' -f1 | tr -d '\n')
  BODY=$(echo "$PUSH_CONTENT" | cut -d'|' -f2- | tr -d '\n')
  if [ -n "$BODY" ]; then
    echo "[heartbeat] sending push: $TITLE | $BODY"
    curl -s -X POST "$BRIDGE_URL/api/push/send" \
      -H "Content-Type: application/json" \
      -H "x-bridge-secret: $BRIDGE_SECRET" \
      -d "{\"title\":\"$(echo "$TITLE" | sed 's/"/\\"/g')\",\"body\":\"$(echo "$BODY" | sed 's/"/\\"/g')\"}"
    echo ""
  fi
else
  echo "[heartbeat] nothing to send"
fi

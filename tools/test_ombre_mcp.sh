#!/bin/bash
# Minimal check: can the CC CLI connect to Ombre's MCP and call a tool?
# Uses the read-only `pulse` tool so nothing is created or changed.
REPO=/root/repo

# Locate the CC CLI binary the same way the bridge does.
CLAUDE_BIN="$(find /root/.npm -name claude -type f -path '*claude-code*' 2>/dev/null | head -1)"
[ -z "$CLAUDE_BIN" ] && CLAUDE_BIN="$(command -v claude)"
[ -z "$CLAUDE_BIN" ] && CLAUDE_BIN="claude"

echo "CC CLI: $CLAUDE_BIN"
echo "MCP config: $REPO/.mcp.json"
echo "-------- calling Ombre pulse via CC CLI --------"

# Strip any inherited API key so OAuth is used, matching the bridge.
unset ANTHROPIC_API_KEY

# NOTE: no --permission-mode / --dangerously-skip-permissions here — CC CLI
# forbids those under root. An explicit --allowedTools whitelist is enough:
# whitelisted tools auto-run in -p mode without a permission prompt.
printf '用 pulse 工具查一下 Ombre 记忆库的状态，然后一句话汇报连上了没、总共多少桶。' \
  | "$CLAUDE_BIN" -p \
      --mcp-config "$REPO/.mcp.json" \
      --allowedTools "mcp__ombre__pulse"

echo
echo "-------- done (exit $?) --------"

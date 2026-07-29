#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Ombre cleanup DRY-RUN — READ ONLY. Lists what *would* be archived:
#   A) exact duplicates (keep the earliest, suggest archiving the rest)
#   B) buckets that look like frontend/system testing, NOT talking to me
#      (only listed for YOU to confirm — never auto-decided)
# Everything else — her 口癖, daily talk, milestones — is left untouched.
# This script does NOT archive, move, or delete anything.
import os, re, hashlib
from collections import defaultdict

BUCKETS = os.environ.get("OMBRE_BUCKETS_DIR", "/app/buckets")

# Phrases that mark "she was debugging the frontend", not talking to me.
TEST_MARKERS = [
    "再来一句", "十个字", "这个模型怪", "换一句", "试一下语音",
    "说句话试试", "随便说", "测试一下", "再说一句", "发个语音试",
]


def parse(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    body = text
    m = re.match(r"^---\s*\n.*?\n---\s*\n?(.*)$", text, re.S)
    if m:
        body = m.group(1)
    return body.strip()


rows = []
for root, dirs, files in os.walk(BUCKETS):
    dirs[:] = [d for d in dirs if not d.startswith("_") and d != "archive"]
    for fn in files:
        if not fn.endswith(".md"):
            continue
        p = os.path.join(root, fn)
        try:
            body = parse(p)
        except Exception:
            continue
        rel = os.path.relpath(p, BUCKETS)
        rows.append({
            "file": rel,
            "body": body,
            "head": re.sub(r"\s+", " ", body[:60]),
            "norm": re.sub(r"\s+", "", body).lower(),
        })

print("=== A · 完全重复（每组保留最早的，归档其余）===")
groups = defaultdict(list)
for r in rows:
    groups[hashlib.md5(r["norm"].encode()).hexdigest()].append(r)
dup_archive = 0
for h, g in groups.items():
    if len(g) < 2:
        continue
    g.sort(key=lambda r: r["file"])  # earliest timestamp filename first
    print("  内容：<<%s>>" % g[0]["head"])
    print("    保留 : %s" % g[0]["file"])
    for r in g[1:]:
        print("    归档→: %s" % r["file"])
        dup_archive += 1

print()
print("=== B · 疑似“调试系统”的对话（待你确认，我不擅自动）===")
test_hits = [r for r in rows if any(k in r["body"] for k in TEST_MARKERS)]
for r in test_hits:
    print("  ? %s" % r["file"])
    print("      <<%s>>" % r["head"])

print()
print("=== 汇总 ===")
print("A 完全重复 · 建议归档：%d 个" % dup_archive)
print("B 疑似测试 · 待你确认：%d 个" % len(test_hits))
print("其余全部保留 —— 口癖 / 日常 / 里程碑一律不动。")

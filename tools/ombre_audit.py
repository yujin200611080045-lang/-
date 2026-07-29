#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Ombre bucket audit — READ ONLY. Scans the bucket files and reports where the
# cruft is: tiny fragments, exact duplicates, and how buckets group by
# source_tool / creation date (so we can spot the machine-imported batch).
# It does NOT modify, move, or delete anything.
import os, re, hashlib
from collections import Counter, defaultdict

BUCKETS = os.environ.get("OMBRE_BUCKETS_DIR", "/app/buckets")


def parse(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    fm, body = {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line[:1].isspace() and not line.startswith("-"):
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip("\"'")
        body = m.group(2)
    return fm, body.strip()


rows = []
for root, dirs, files in os.walk(BUCKETS):
    # skip Ombre internal dirs (evidence, ledger, embeddings, etc.)
    dirs[:] = [d for d in dirs if not d.startswith("_")]
    for fn in files:
        if not fn.endswith(".md"):
            continue
        p = os.path.join(root, fn)
        try:
            fm, body = parse(p)
        except Exception:
            continue
        rel = os.path.relpath(p, BUCKETS)
        rows.append({
            "file": rel,
            "dir": rel.split(os.sep)[0],
            "len": len(body),
            "src": fm.get("source_tool", ""),
            "created": (fm.get("created", "") or "")[:10],
            "imp": fm.get("importance", ""),
            "head": re.sub(r"\s+", " ", body[:50]),
            "norm": re.sub(r"\s+", "", body).lower(),
        })

print("=== 总览 ===")
print("总桶数:", len(rows))
print("按目录:", dict(Counter(r["dir"] for r in rows)))
print("按 source_tool:", dict(Counter(r["src"] or "(空)" for r in rows)))
print("按创建日期:", dict(sorted(Counter(r["created"] or "(无)" for r in rows).items())))

print()
print("=== 碎桶 (正文<40字) ===")
tiny = sorted((r for r in rows if r["len"] < 40), key=lambda r: r["len"])
print("数量:", len(tiny), "  (下面最多列 30 条)")
for r in tiny[:30]:
    name = r["file"].split(os.sep)[-1][:24]
    print("  [%3d] %s/%s  <<%s>>" % (r["len"], r["dir"], name, r["head"]))

print()
print("=== 完全重复 (正文去空白后完全相同) ===")
groups = defaultdict(list)
for r in rows:
    groups[hashlib.md5(r["norm"].encode()).hexdigest()].append(r)
dups = {h: g for h, g in groups.items() if len(g) > 1}
print("重复组数:", len(dups), "  涉及桶数:", sum(len(g) for g in dups.values()))
for h, g in list(dups.items())[:20]:
    print("  x%d: <<%s>>" % (len(g), g[0]["head"]))
    for r in g:
        print("       - %s" % r["file"])

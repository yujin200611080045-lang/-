#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# READ ONLY. Dumps a sample of grow-sourced buckets (created by the import
# digest) so we can judge whether they are clean, self-contained semantic
# points or machine-chopped fragments cut mid-sentence. Changes nothing.
import os, re

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
    dirs[:] = [d for d in dirs if not d.startswith("_") and d != "archive"]
    for fn in files:
        if not fn.endswith(".md"):
            continue
        p = os.path.join(root, fn)
        try:
            fm, body = parse(p)
        except Exception:
            continue
        if fm.get("source_tool") == "grow":
            rows.append((os.path.relpath(p, BUCKETS), fm.get("created", "")[:10], body))

rows.sort()
print("grow 来源的桶共 %d 个，抽前 18 个看质量：" % len(rows))
print("(重点：每条是不是一个完整的意思？有没有切在半句、或半件事上？)")
print("=" * 52)
for rel, created, body in rows[:18]:
    b = body if len(body) <= 260 else body[:260] + " …[截断]"
    print("* %s  (%s, %d字)" % (rel.split(os.sep)[-1], created, len(body)))
    print("  " + b.replace("\n", "\n  "))
    print("-" * 42)

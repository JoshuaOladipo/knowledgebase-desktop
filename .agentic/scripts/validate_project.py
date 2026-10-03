#!/usr/bin/env python3
from pathlib import Path
import re,sys
r=Path.cwd(); errors=[]; warnings=[]
for rel in [".agentic/VERSION",".agentic/AGENTS.md","architecture/CONTRACT.yaml","tasks/active","tasks/completed"]:
 p=r/rel
 if not p.exists(): errors.append("Missing: "+rel)
for d in [r/"tasks/active",r/"tasks/completed"]:
 if d.exists():
  for f in d.glob("*.md"):
   t=f.read_text(encoding="utf-8"); ids=re.findall(r"^###\s+(TASK-\d+)",t,re.M)
   if len(ids)!=len(set(ids)): errors.append(f"{f.relative_to(r)} has duplicate task IDs")
   for m in re.finditer(r"`([^`\n]+):(\d+)-(\d+)`",t):
    p,a,b=m.group(1),int(m.group(2)),int(m.group(3))
    if not (r/p).exists(): warnings.append(f"{f.relative_to(r)} references missing {p}")
    if a<1 or b<a: errors.append(f"{f.relative_to(r)} has invalid range {p}:{a}-{b}")
print("Agentic project validation")
for x in warnings: print("WARNING:",x)
for x in errors: print("ERROR:",x)
if errors: sys.exit(1)
print(f"PASS ({len(warnings)} warning(s))")

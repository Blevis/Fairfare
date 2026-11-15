"""Minimal runner so the tests need no extra dependency:  python -m tests"""
import sys
import traceback

from . import test_protocol as t

failed = 0
for name in sorted(n for n in dir(t) if n.startswith("test_")):
    try:
        getattr(t, name)()
        print(f"PASS  {name}")
    except Exception:
        failed += 1
        print(f"FAIL  {name}")
        traceback.print_exc()
print(f"\n{failed} failed" if failed else "\nall passed")
sys.exit(1 if failed else 0)

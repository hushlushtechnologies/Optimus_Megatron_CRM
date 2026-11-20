"""
Assert a Promise.all destructure lines up one for one with its array.

A short array hands back undefined for the extra names, and tsc only notices
when the receiving prop happens to be non-nullable — so this is checked
directly. Comments are stripped before splitting, because a comma inside one
is not a separator.
"""
import re, sys

path = sys.argv[1]
src = open(path).read()

seg = src[src.index("const ["):]
seg = seg[:seg.index("]);") + 3]

names = [n.strip().rstrip(",") for n in seg[seg.index("[") + 1 : seg.index("]")].split("\n")]
names = [n for n in names if n]

arr = seg[seg.index("await Promise.all([") + len("await Promise.all([") : seg.rindex("]")]
arr = re.sub(r"/\*.*?\*/", "", arr, flags=re.S)        # block comments
arr = re.sub(r"//[^\n]*", "", arr)                      # line comments

parts, depth, buf = [], 0, ""
for ch in arr:
    if ch in "([{": depth += 1
    elif ch in ")]}": depth -= 1
    if ch == "," and depth == 0:
        parts.append(buf); buf = ""
    else:
        buf += ch
parts.append(buf)

calls = [p for p in parts if p.strip()]

print(f"destructured: {len(names)}")
print(f"promises:     {len(calls)}")

if len(names) != len(calls):
    print("MISMATCH — a name would receive undefined")
    sys.exit(1)

print("one for one")

"""Function bounds from the PE .pdata exception table (RUNTIME_FUNCTION[])."""
import struct, bisect
from pe import PE

def functions(pe):
    s = pe.sec('.pdata')
    b = pe.buf[s['off']:s['off'] + s['size']]
    out = []
    for i in range(0, len(b) - 11, 12):
        start, end, unwind = struct.unpack_from('<III', b, i)
        if start == 0 and end == 0: continue
        out.append((pe.image_base + start, pe.image_base + end))
    out.sort()
    return out

def enclosing(funcs, va):
    starts = [f[0] for f in funcs]
    i = bisect.bisect_right(starts, va) - 1
    if i >= 0 and funcs[i][0] <= va < funcs[i][1]:
        return funcs[i]
    return None

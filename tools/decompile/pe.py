"""Minimal PE reader + RIP-relative xref finder for victoria3.exe."""
import struct, sys

class PE:
    def __init__(self, path):
        self.buf = open(path, 'rb').read()
        b = self.buf
        pe = struct.unpack_from('<I', b, 0x3c)[0]
        assert b[pe:pe+4] == b'PE\0\0', 'not a PE'
        nsec, = struct.unpack_from('<H', b, pe + 6)
        optsz, = struct.unpack_from('<H', b, pe + 20)
        self.image_base, = struct.unpack_from('<Q', b, pe + 24 + 24)
        sec0 = pe + 24 + optsz
        self.sections = []
        for i in range(nsec):
            o = sec0 + 40 * i
            name = b[o:o+8].rstrip(b'\0').decode('ascii', 'replace')
            vsize, va, rawsize, rawptr = struct.unpack_from('<IIII', b, o + 8)
            self.sections.append(dict(name=name, va=self.image_base + va,
                                      vsize=vsize, off=rawptr, size=rawsize))
    def sec(self, name):
        return next(s for s in self.sections if s['name'] == name)
    def va_to_off(self, va):
        for s in self.sections:
            if s['va'] <= va < s['va'] + max(s['vsize'], s['size']):
                return s['off'] + (va - s['va'])
        return None
    def off_to_va(self, off):
        for s in self.sections:
            if s['off'] <= off < s['off'] + s['size']:
                return s['va'] + (off - s['off'])
        return None
    def find_bytes(self, needle, secname=None):
        out, start = [], 0
        rng = None
        if secname:
            s = self.sec(secname); rng = (s['off'], s['off'] + s['size'])
        while True:
            i = self.buf.find(needle, start)
            if i < 0: break
            if not rng or (rng[0] <= i < rng[1]):
                out.append(i)
            start = i + 1
        return out

def xrefs(pe, target_va, secname='.text'):
    """Every position in .text whose trailing disp32 makes RIP point at target_va."""
    import numpy as np
    s = pe.sec(secname)
    data = np.frombuffer(pe.buf[s['off']:s['off'] + s['size']], dtype=np.uint8)
    n = len(data) - 4
    # disp32 at file position p (0-based in section) -> next-insn VA = base + p + 4
    d = (data[0:n].astype(np.int64)
         | (data[1:n+1].astype(np.int64) << 8)
         | (data[2:n+2].astype(np.int64) << 16)
         | (data[3:n+3].astype(np.int64) << 24))
    d = np.where(d >= 0x80000000, d - 0x100000000, d)
    want = target_va - s['va'] - 4          # d must equal want - p
    p = np.arange(n, dtype=np.int64)
    hit = np.nonzero(d == (want - p))[0]
    return [s['va'] + int(x) for x in hit]

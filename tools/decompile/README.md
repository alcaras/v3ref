# Decompiling victoria3.exe

Toolchain for recovering hardcoded mechanics the script files do not expose.
Used to establish the land-battle model in `docs/battle-mechanics.md`.

## Why this works

The shipped exe is stripped, but it carries a **profiler/RNG context table**:
every deterministic random roll is tagged with `(source file, line, function
name)` so multiplayer desyncs can be traced. Those tags are plain strings in
`.rdata`, and the code that loads them is the code that does the work. That
gives an entry point into any subsystem by name.

`.pdata` (the PE exception table) holds a `RUNTIME_FUNCTION` entry for all
250,255 functions, so exact function bounds are free — no analysis needed.

## Setup

```
brew install radare2                 # optional, for quick navigation
brew install --cask ghidra           # 12.x
brew install openjdk@21              # Ghidra 12 needs 21, not the system 8
```

## Finding an entry point

```python
from pe import PE, xrefs
from pdata import functions, enclosing
pe = PE('…/binaries/victoria3.exe')
fs = functions(pe)

# The file-path string must be matched from its START ("C:\mnt\gsg\…"), not
# from a substring — a substring's VA is not what the code references, and you
# will get zero xrefs and wrongly conclude the string is unreferenced.
va  = pe.off_to_va(pe.find_bytes(b'C:\\mnt\\gsg\\…\\battle_casualties.cpp\x00')[0])
for x in xrefs(pe, va):
    print(enclosing(fs, x))
```

`xrefs` scans every byte offset for a trailing `disp32` whose RIP-relative
target is the address wanted, so it catches `lea`, `call` and `mov` alike
without needing to know the opcode.

## Decompiling

Import **once** with `-noanalysis` — full auto-analysis of a 92MB binary with
250k functions is hours and needs far more than the 2G default heap. The script
disassembles and creates each target function on demand instead, which costs
about 40 seconds per batch.

```
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export GHIDRA_HEADLESS_MAXMEM=12G

# first time: import
analyzeHeadless /tmp/v3sim/ghidra_proj v3 -import victoria3.exe \
  -processor x86:LE:64:default -cspec windows -noanalysis

# thereafter: decompile any addresses you like
V3_OUT=/tmp/out.c V3_TARGETS="0x140d7f160,0x140d8fdb0" \
analyzeHeadless /tmp/v3sim/ghidra_proj v3 -process v3.exe -noanalysis \
  -scriptPath tools/decompile -postScript DecompileList.java
```

Output is unnamed (`FUN_…`, `DAT_…`) because nothing is analysed, but the
arithmetic is intact and readable, which is all that is wanted here.

## Reading the output

Values are **fixed point, scale 100000**. `(a * b) / 100000` is a multiply and
`(a * 100000) / b` is a divide; the branchy variants around
`0xb504f333` / `0x53e2d6238da3` are overflow-safe paths for the same operation.
Ignore them and read the simple branch.

Datafunctions (`Battle.GetOffenseRaw` and friends) reach their implementation
through two thunks: the registrar call passes the real function pointer, and
that function forwards to the actual body. Follow both hops.

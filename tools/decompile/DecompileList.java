// Decompile the functions named in $V3_TARGETS (comma-separated hex addresses).
// Works on a -noanalysis import: disassembles at each address first, so we pay
// only for the handful of functions we care about instead of all 250k.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.Function;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import java.io.*;

public class DecompileList extends GhidraScript {
    @Override
    public void run() throws Exception {
        String targets = System.getenv("V3_TARGETS");
        String outPath = System.getenv("V3_OUT");
        if (targets == null || outPath == null) { println("V3_TARGETS/V3_OUT unset"); return; }
        DecompInterface d = new DecompInterface();
        d.setOptions(new DecompileOptions());
        d.openProgram(currentProgram);
        PrintWriter w = new PrintWriter(new FileWriter(outPath, true));
        for (String t : targets.split(",")) {
            t = t.trim();
            if (t.isEmpty()) continue;
            Address a = currentProgram.getAddressFactory().getAddress(t);
            if (getInstructionAt(a) == null) {
                DisassembleCommand dc = new DisassembleCommand(a, null, true);
                dc.applyTo(currentProgram, monitor);
            }
            Function f = getFunctionContaining(a);
            if (f == null) {
                CreateFunctionCmd cf = new CreateFunctionCmd(a);
                cf.applyTo(currentProgram, monitor);
                f = getFunctionContaining(a);
            }
            if (f == null) { w.println("// " + t + ": could not make a function"); w.flush(); continue; }
            DecompileResults r = d.decompileFunction(f, 300, monitor);
            w.println("\n// ================= " + t + "  " + f.getName() + " =================");
            if (r != null && r.decompileCompleted()) w.println(r.getDecompiledFunction().getC());
            else w.println("// decompile failed: " + (r == null ? "null" : r.getErrorMessage()));
            w.flush();
        }
        w.close();
        println("WROTE " + outPath);
    }
}

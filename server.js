const { spawn } = require("child_process");

const proc = spawn("cmd.exe", ["/c", "npx next start -H 127.0.0.1 -p 3003"], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  cwd: __dirname,
});

proc.stdout.pipe(process.stdout);
proc.stderr.pipe(process.stderr);
proc.on("exit", (code) => process.exit(code ?? 0));

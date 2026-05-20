import { request } from "node:http";

const socketPath = process.argv[2];
if (!socketPath) {
  process.stderr.write("usage: node hook-client.js <socket-path>\n");
  process.exit(1);
}

const chunks: Buffer[] = [];
process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
process.stdin.on("end", () => {
  const body = Buffer.concat(chunks).toString("utf8");
  const req = request(
    {
      socketPath,
      path: "/hook",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      res.pipe(process.stdout);
    },
  );
  req.on("error", (err) => {
    process.stderr.write(`hook-client error: ${err.message}\n`);
    process.exit(1);
  });
  req.end(body);
});

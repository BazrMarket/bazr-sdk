import { writeSync } from "node:fs";
import { runCli } from "./cli.js";

/**
 * Exit status, so scripts and CI can branch on it.
 *
 *   0   the command ran and the service answered
 *   1   the command ran and failed (unreachable API, HTTP error, bad payload,
 *       or `bazr health` against a service reporting anything but "ok")
 *   2   the command line itself was wrong (unknown option, missing argument)
 *   70  bazr stopped before producing a result -- a bug in bazr itself
 *       (EX_SOFTWARE from sysexits, "internal software error")
 */
const EXIT_INTERNAL = 70;

/**
 * `bazr relic <mint> | head` closes the pipe early. Without this the process
 * dies with an unhandled EPIPE stack trace, which is exactly the kind of
 * output this CLI is not allowed to produce.
 */
function quietOnBrokenPipe(stream: NodeJS.WriteStream): void {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
}

quietOnBrokenPipe(process.stdout);
quietOnBrokenPipe(process.stderr);

function write(stream: NodeJS.WriteStream, line: string): void {
  try {
    stream.write(`${line}\n`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPIPE") process.exit(0);
    throw err;
  }
}

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

/*
  Last line of defence: the process must never exit quietly with a command
  still in flight.

  If any promise in the `runCli` chain never settles, Node empties the event
  loop and leaves on its own. Nothing was printed, nothing threw, and the exit
  status is whatever Node felt like -- 0 when the failure is inside a callback,
  13 for an unsettled top-level await. A shell script or CI job reads either as
  success and moves on with no result in hand.

  That is not hypothetical: an unref'd backoff timer in the SDK killed
  `bazr relic` on every cache miss and reported it as a clean run. The timer is
  fixed, but the class of bug is not something a caller should have to detect
  by noticing that the output was empty, so the guard stays.
*/
let finished = false;

process.on("exit", () => {
  if (finished) return;
  // An 'exit' listener may only do synchronous work; a buffered
  // `process.stderr.write` to a pipe would be dropped on the way out.
  writeSync(
    2,
    "X  bazr stopped before the command produced a result.\n" +
      "   Nothing was printed because nothing finished -- this is a bug in bazr,\n" +
      "   not in the arguments you passed. Re-run with --debug and report it.\n",
  );
  process.exitCode = EXIT_INTERNAL;
});

try {
  process.exitCode = await runCli({
    argv: process.argv.slice(2),
    stdout: (line) => write(process.stdout, line),
    stderr: (line) => write(process.stderr, line),
    env: process.env,
    isTTY: Boolean(process.stdout.isTTY),
    ...(process.stdout.columns ? { columns: process.stdout.columns } : {}),
  });
} catch (err) {
  // `runCli` renders its own failures and returns a code; reaching here means
  // it threw on the way in or out. Still a sentence, still a non-zero status.
  write(process.stderr, `X  ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) write(process.stderr, err.stack);
  process.exitCode = EXIT_INTERNAL;
} finally {
  finished = true;
}

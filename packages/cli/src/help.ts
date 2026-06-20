/**
 * Help text. Plain ASCII, no emoji, no glyph status markers.
 *
 * The last paragraph is not decoration: it is what the whole tool claims and
 * what it refuses to claim.
 */

export const HELP = `bazr -- terminal client for the BAZR meme aftermarket

USAGE
  bazr <command> [options]

COMMANDS
  relic <mint>           Relic tag: score, five-axis breakdown, labels
  tags <mint>            Labels only, for one mint
  stalls                 Stall ranking with wins and losses side by side
  stall <owner>          One stall and everything it has on the table
  crate list             Crates currently assembled
  crate show <id>        One crate and its components
  haggle                 Simulate a route over existing liquidity
  stats                  Counters the service reports for the market
  health                 Whether the service is answering

GLOBAL OPTIONS
  --api <url>            API base URL (default: $BAZR_API or http://localhost:8030)
  --json, -j             Print the validated API response as JSON
  --timeout <ms>         Per-attempt timeout in milliseconds
                         (default: 90000 for relic and tags, 10000 elsewhere --
                         scoring a mint nobody has looked at yet walks holder
                         pages and takes tens of seconds)
  --retries <n>          Total attempts including the first (default: 3)
  --color / --no-color   Force colour on or off; auto-detected otherwise
  --debug                Print the stack trace when something fails
  --help, -h             This text
  --version, -v          Print the version

COMMAND OPTIONS
  relic  --refresh                     Bypass the server cache (tighter rate limit)
  stalls --sort record|recent|listings
         --limit <n>  --cursor <s>
  crate list --limit <n>  --cursor <s>
  haggle --in <mint> --out <mint> --amount <raw base units>
         [--slippage-bps <n>]

EXAMPLES
  bazr relic So11111111111111111111111111111111111111112
  bazr relic <mint> --refresh --api http://localhost:8030
  bazr stalls --sort record --limit 20
  bazr crate show 3
  bazr haggle --in <mint> --out <mint> --amount 1000000 --slippage-bps 100
  bazr tags <mint> --json

EXIT STATUS
  0   the command ran and the service answered
  1   the command failed (unreachable API, HTTP error, unexpected payload, or
      health reporting anything but "ok")
  2   the command line was wrong (unknown option, missing argument)
  70  bazr stopped before producing a result -- a bug in bazr itself

WHAT THIS IS
  BAZR only looks at tokens that already graduated from a launchpad. A relic
  score is a weighted summary of survival signals with every input shown, not
  a prediction of price or revival. Axes that could not be observed print as
  "--" and are excluded from the weighting; they are never counted as zero.
  Stall records print wins and losses as raw counts, never as a rate alone.
`;

#!/bin/sh
# Recording git for test/run-tracehound.test.ts (copied into the fixture dir as `git`): appends one line per call to
# git.log next to it (argv joined by tabs, then the GIT_NO_LAZY_FETCH value), then runs the real git from PATH on the
# local fixture repo. /bin/sh, not node, so a call costs milliseconds.
log="$(dirname "$0")/git.log"
{ for a in "$@"; do printf '%s\t' "$a"; done; printf '|%s\n' "${GIT_NO_LAZY_FETCH-unset}"; } >> "$log"
exec git "$@"

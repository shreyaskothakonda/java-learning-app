Data files for `stdio` problems whose input is too large to inline — a case
names them with `stdinFile` / `stdoutFile` and the runner resolves them here.

The directory is kept even while empty because the packaged app resolves it as
a resource (see `src/main/paths.ts`), and a path that exists in development and
not in the bundle is precisely the class of bug that cost Phase 2 a day.

# Crit 7 reflection

**The breakthrough** was realising that "it works locally" and "it works" are
different claims the moment a Docker image is involved. Every test I had —
typecheck, the full Vitest suite against the *built* server, a keyboard-only
Playwright pass at both marking viewports — passed cleanly, and the app still
500'd in production. The Dockerfile's runtime stage copied `node_modules`,
`dist`, and `drizzle`, but never `data/`, so the dataset file simply wasn't in
the shipped image. Nothing in my local harness could have caught that,
because locally the built server just reads the repo's own `data/` directory
directly. The fix was one `COPY` line, but finding it meant treating the
passing checks as necessary, not sufficient, and actually reading
`flyctl logs` instead of assuming the deploy step itself was the risky part.

**What this changed** is how I think about "done." I'd already internalised
not trusting a green check for anything a user experiences visually — that's
why I was running keyboard-only Playwright passes at two viewports before
this crit. This week extended that same suspicion to infrastructure: a build
artifact (a Docker image) is itself something you have to inspect, not
something a passing test suite lets you infer is correct. Going forward, when
a change touches how something is packaged or deployed — not just what it
does — I want to actually run it in that packaged form before calling it
verified, the same way I already insist on opening a real browser before
calling a layout correct.

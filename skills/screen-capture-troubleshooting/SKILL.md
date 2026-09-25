---
name: screen-capture-troubleshooting
description: Diagnose desktop screenshots that omit visible windows or return black content, compare capture backends and a working reference product, and document version-scoped fixes with an evidence timeline. Use for capture failures or integrating a verified local screenshot path.
---

# Screen capture troubleshooting

Start from the visible failure and the user's intended use. A nonempty image proves an image was returned, not that the target window was captured. Keep screenshots local unless the user authorizes a specific destination.

## Compare observable paths

- Record the OS/build, target app version, capture host/version, permission state, display and window state. Record discovery and verification timestamps with timezone; distinguish first user report from first developer reproduction.
- Hold the target window and display constant and compare captures close in time. Check target content, not only dimensions or exit codes. Avoid reading unrelated window contents or publishing private captures.
- Verify the actual backend. Two Python libraries can wrap the same system utility; count them as the same path when that is what they invoke.
- When the user identifies a working industry reference, use its successful behavior as a testable clue. App symbols show available implementations; logs or a minimal reproducer are needed to support the active path. Name the reference and what was learned without implying access to its full source or a broad performance ranking.
- Keep unsuccessful attempts and corrections. Separate an experiment that was suggested, one actually run, and one reported by the user. Do not infer intentional blocking or a universal impossibility from a missing window.

## Turn a verified path into a feature

Prefer a minimal local reproducer before integration. Check current official API documentation and actual SDK/runtime behavior. A deprecated or unavailable SDK declaration is distinct from runtime symbol availability; a dated compatibility result is not a permanent guarantee.

The 2026-09-25 SayAgain case found a usable CGDisplayStream path on macOS 26.5.2 after a working Sunlogin/AweSun reference. Treat this as historical evidence, not a default choice on another system. If needed, read the [public case study](https://github.com/hotpoor/HOTPOOR-SayAgain/blob/main/docs/screen-capture-case-study.md) and [implementation guide](https://github.com/hotpoor/HOTPOOR-SayAgain/blob/main/docs/screen-capture.md); the skill itself does not bundle a screenshot executable or require the SayAgain checkout for basic diagnosis.

For product integration, verify permission errors, missing helpers, timeouts, empty output and clipboard failures; preserve existing user settings and clipboard on capture failure. If multiple products share one shortcut, verify exclusive ownership, handoff, conflict rollback and restart persistence. Run real-screen tests only within the user's capture authorization, using a nonprivate fixture where possible. Never silently replace a failed capture with a known incomplete one and claim success.

## Publish an evidence-based account

State the problem, reference product and selection rationale, attempted paths and results, implementation, validation and remaining limits. Use recorded timestamps; distinguish elapsed session time from coding time and prototype completion from product integration. If exact times or versions are absent, mark them unknown rather than deriving them from file modification dates.

Record the tested date and environment, conditions requiring retest, and behavior on failure. There is no assumed expiry date: updates to the OS, target app, permissions, signing or capture backend require a fresh content comparison. Publish source and minimal redacted evidence, not raw chat screenshots, full logs, account identifiers or speculative claims.

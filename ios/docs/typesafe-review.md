# TypeSafe skill application

Installed using `npx skills add … --skill typesafe-ai --agent codex --global --yes`. GitHub's Git transport failed, so the same installer consumed a temporary local copy of the official raw SKILL.md. Installed skill: `~/.agents/skills/typesafe-ai/SKILL.md`. Read the official skill and live documentation index.

Applied the skill's boundary: known rules, exact selections and execution belong in code. This change needs no semantic model judgment: users explicitly select a speech model, font scale and volume. It therefore adds no TypeSafe API dependency, no invented confidence scores and no silent upload of user expressions to another provider.

- `SpeechModel` and `SpeechFamily` define the closed model set and actual API routing.
- `Preferences` validates and persists global settings; change notifications update views and playback.
- Account secrets remain in Keychain, separate from preferences and review records.
- Model identity participates in remote voice and local synthesis cache identity.
- Tests distinguish mocked API behavior, real-device UI verification and paid live synthesis (not performed).

A future semantic feature, such as suggesting expression categories, should separately read the current TypeSafe API and primitive guidance before any integration.

The review/waveform redesign follows the same boundary: visual comparison is performed on actual Electron/iPad screenshots; PCM waveform extraction, progress, layout breakpoints, and user-selected models are deterministic code. No TypeSafe semantic API call or AI-generated waveform is used.

The iPad local ASR feasibility probe uses the existing SenseVoice acoustic model through native sherpa/ORT. TypeSafe is not an acoustic recognizer and no TypeSafe API call was added; model choice, PCM conversion, the ten-second bound and benchmark calculation remain deterministic code.

Whole-recording extension: re-read the live TypeSafe building guide. Segment buffering, energy thresholds, explicit cancellation and draft persistence remain deterministic. This work adds no TypeSafe API request or semantic validation claim.

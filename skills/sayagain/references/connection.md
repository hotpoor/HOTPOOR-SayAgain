# Install and connect

Copy the whole `sayagain` folder to a skill location supported by your client, or ask that client to read its `SKILL.md` explicitly. If the host uses a project-scoped skills directory, install there for only that project. No host configuration or hooks are installed automatically.

Requirements: Node.js 22 or later, local command execution, and SayAgain running on the same computer. A model running through a local agent can use the scripts regardless of model provider. A remote chat without local tools cannot reach this loopback service.

1. In SayAgain settings enable **本地接口**. This allows calls; it does not install the Skill in any client.
2. In the other client explicitly request SayAgain review and run `node <skill-directory>/scripts/client.cjs context`.
3. Successful context retrieval verifies connectivity and returns the language pair. It does not mean a review was saved.
4. Evaluate an authorized user passage and submit according to [review-protocol.md](review-protocol.md). A successful submission returns the evaluation receipt; SayAgain settings displays the latest receipt. Do not submit a fabricated evaluation merely to test a user's live database.

For a different application data directory set `SAYAGAIN_DATA_DIR` to its absolute directory, or `SAYAGAIN_CONNECTION_FILE` to the local descriptor file. Tokens are read internally; never copy that descriptor into this package or share it with another user. On another computer install SayAgain there and use that computer's own data and connection.

For continued use, offer conversation-only, a specified workspace, or all workspaces and follow [persistent review setup](persistence.md). Once the user selects workspace/global scope, save the preference in the host's effective instructions; do not stop at copying the Skill. Honor scope choices already given. Verify saved instructions, fresh-session loading, connectivity and evaluation receipts separately. `scripts/prompt-hook.cjs` remains an optional host reminder, not an installed hook or a guarantee of every-turn execution.

Local model helpers included in this folder:

- `node <skill-directory>/scripts/setup-tts.cjs`: status and disk check; add `--install` only for a requested pinned 0.6B CPU installation.
- `node <skill-directory>/scripts/register-local-tts.cjs --python <absolute-path> --model-path <absolute-path> --device <cpu|cuda:0|mps>`: register a requested existing 0.6B/1.7B Base environment without downloads.

The review API currently offers context and review submission, not remote control of audio generation or voice management. Use the desktop app for those actions.

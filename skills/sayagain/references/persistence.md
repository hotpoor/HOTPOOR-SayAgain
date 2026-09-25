# Persist the user's review scope

Use this workflow when installing/connecting SayAgain or when the user asks to keep reviewing in later conversations. Explain the available scopes briefly. If no scope is selected, ask once: “仅本次对话、指定工作区，还是所有工作区持续使用 SayAgain？” Continue authorized connection checks while awaiting the choice. A request to try a sentence is conversation-only; do not silently turn it into global review. An explicit scope in this or earlier conversation is sufficient authorization; carry out that choice without reconfirming it.

## Choose a durable entry point

- **Conversation only:** keep the preference in this conversation; do not edit persistent host configuration. State that a new conversation has not been configured.
- **Specified workspace:** resolve the actual workspace/repository path. Install the complete package in a stable location accessible there and merge a SayAgain section into the instruction file that the host loads for that workspace. Do not enable sibling projects.
- **Global / all workspaces:** install the complete package in the host's user-level skill location, then merge a SayAgain section into its supported user-level instructions. The installed skill path must remain reachable outside the current repository. Do not reference a temporary export folder or this source checkout as the permanent global installation.

Inspect existing instructions and any existing same-name skill before writing. Preserve unrelated content, compare differences, and back up files before replacing an existing SayAgain section or updating the skill. Keep one active SayAgain section per scope; do not append duplicates. If the user changes scope, update/remove only the previous SayAgain section as needed so a global rule does not defeat a new workspace-only choice. Report the final active scopes. A request to pause/disable persistent review updates the relevant section; it does not delete saved expressions.

### Codex

Resolve `CODEX_HOME` (default `~/.codex`) and the actual user home; never copy a developer's machine-specific path into the package. Codex loads a nonempty `AGENTS.override.md` before `AGENTS.md` at each level. Read the effective file and merge into it; writing only the ignored file is not activation. For global scope, use the effective instructions under `CODEX_HOME`. For a repository, use its effective root instructions. Codex normally searches from the Git root down, so an instruction only in a parent folder of several independent repositories may not be loaded.

For a named workspace containing multiple independent repositories, use a user-level instruction **guarded by that workspace's absolute path** to read its workspace instructions, if the user's selected scope includes those repositories. The guard must leave other workspaces inactive; this routing entry is not global review authorization. Report both files. For worktrees outside that path, do not assume inclusion: use a verified repository association if the user requested all worktrees of that repository, otherwise retain the path boundary.

Official discovery reference: https://learn.chatgpt.com/docs/agent-configuration/agents-md . For other hosts, use their documented equivalents; do not assume they load `AGENTS.md`. If persistent instructions are unsupported or inaccessible, report connection-only status and the concrete limitation rather than claiming persistence.

## Instruction section template

Adapt the following section to the user's language, selected scope and **verified installed path**, replacing placeholders before saving. Store only the skill path and preference, never connection tokens, GitHub tokens, credentials, fixed conversation IDs or full user messages.

```markdown
<!-- sayagain:begin -->
## SayAgain 持续表达回顾

用户已选择在【指定范围】持续使用 SayAgain。此范围内的新对话处理用户本人表达时，读取【已安装 Skill 的绝对路径】并按其协议评估和提交到本机 SayAgain，不打断主任务。
只处理用户自己的表达，排除引用、代码、凭证及只有术语的片段；按当前语言配置判断，原意或语音转写不明确时记录 uncertain 并简短确认，不猜测纠正。
先运行技能的 context 命令检查本地接口和语言配置。应用不可用时简短说明一次，继续主任务，不反复重试，不直接改数据库。
每个对话和消息使用各自稳定来源标识，重试复用，避免重复提交；只有成功回执才说明已保存。用户说暂停或本轮不收录时遵从。
此约定只授权所选范围的表达评估，不自动录音、生成语音、上传音频、安装模型或启用全局 hook。保留其他既有学习流程及其授权范围，不擅自替换或关闭。
<!-- sayagain:end -->
```

Keep host-specific discovery and instruction wording separate from the local API's configuration: the selected language pair still comes from `context` on each evaluation. Do not hard-code Chinese/English or this developer's review website into the portable skill.

## Verify and report separately

1. Read back the saved instruction and installed `SKILL.md`; verify the scope, resolved path, existing content and lack of duplicates. Report “instruction saved” with the concrete paths.
2. Run `node <installed-skill>/scripts/client.cjs context`. Successful retrieval proves local connectivity only.
3. In a fresh task/session in the selected scope, check that the host loads the instruction and skill. For global scope, check from another repository; for workspace scope, also check that an outside workspace is not enabled. Do not create new user-facing tasks without the user's request. If no suitable fresh session is available, report “new-session loading not yet verified”; existing tasks may need to reload instructions.
4. Evaluate a real user-authored passage and check the successful submission receipt. Use isolated fixtures for automated tests; do not add invented practice text to the user's live database. A saved preference, loaded instruction, working connection and saved evaluation are distinct results, none guarantees every-turn coverage.

When contributing this workflow to the SayAgain repository, commit the portable instructions/templates and export changes. Keep the installing user's personal instruction files, installed absolute paths and secrets outside that commit. Commit/push only when authorized by the user's development task.

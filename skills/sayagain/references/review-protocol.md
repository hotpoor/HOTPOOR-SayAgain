# Review protocol v1

`context` returns `config.id`, `config.revision`, `config.native_language`, `config.target_language` and `policy_version`. Copy the exact current ID/revision into the review.

```json
{
  "client": "codex",
  "conversation_id": "stable-session-id",
  "turn_id": "stable-message-id",
  "message_revision": 1,
  "config_id": "32-character-id-from-context",
  "config_revision": 1,
  "policy_version": 1,
  "source_text": "I very like this idea.",
  "decision": "needs_improvement",
  "reason": "动词修饰词可以更自然。",
  "evaluator": "host-model",
  "expressions": [
    {
      "source_span": { "start": 0, "end": 22 },
      "original": "I very like this idea.",
      "improved": "I really like this idea.",
      "translation": "我很喜欢这个想法。",
      "explanation": "really 可以修饰 like；very 通常修饰形容词或副词。",
      "pattern": "I really like + 名词 / 动名词.",
      "category": "naturalness",
      "confidence": 0.95
    }
  ]
}
```

The example's span must be computed from the literal source text: use Unicode code points (`Array.from(text)` in JavaScript), not UTF-16 code units. `end` is exclusive. Always compute rather than copying example offsets. `original` must exactly match the span, without trimming whitespace.

Use real host IDs when available. Otherwise create a session ID once for the enabled conversation and a message ID once per final message, reusing them on retries. Never fabricate IDs that claim to belong to the host. `message_revision` increments when that message changes.

The app validates spans, categories, configuration snapshots and decision consistency. `needs_improvement` requires 1–20 suggestions; all other decisions require an empty `expressions` array. `category` is an open text label: 1–64 Unicode code points after trimming surrounding whitespace, without Unicode control or format characters. The familiar `grammar`, `word_choice`, `naturalness`, `register`, and `translation_practice` values remain supported, but are not an allowlist. Infer other precise categories when justified (for example 逻辑衔接, 歧义消除, 信息完整性); these examples are not a new fixed list. Use the explanation to state why the label fits. The updated context advertises `category_policy: {"type":"open_text","max_length":64}`; if it is absent, the running app may need updating/restarting before new labels can be accepted. Confidence is a finite number between 0 and 1.

The app keeps source hashes and selected original spans, not the full source message. It creates turn/evaluation/expression records atomically. Deduplication includes client, conversation, turn, message revision, source hash, language configuration revision and policy version. A successful retry returns the original evaluation ID with `duplicate: true`.

The bridge listens only on loopback, requires its private connection-file token and rejects browser-origin requests. The client helper reads the token internally; never print, paste into chat or commit that file. Do not send it to a remote URL.

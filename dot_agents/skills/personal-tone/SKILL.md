---
name: personal-tone
description: Drafts or rewrites text in Adam Jarvis's voice, combining anti-AI human-tone editing with his informal Slack style and formal technical writing style. Use when Adam asks for "my tone", "my wording", "write like me", "make this sound like me", personal or informal wording, or invokes $personal-tone.
---

# Personal tone

Write as Adam, not as a generic copywriter trying to sound human.

Read [the voice guide](references/VOICE.md) before drafting. It is the cached source of truth for Adam's informal and formal styles.

## Choose the mode

Infer the mode from the destination:

- **Informal:** Slack, DMs, internal Notion pages, working notes, PR comments, quick team updates.
- **Formal:** technical blog posts, website articles, public engineering explanations, customer-facing technical writing.
- **Hybrid:** LinkedIn, launch notes, founder posts, longer internal decisions. Use formal structure with some informal directness.

Ask which mode only when the destination is unclear and the choice would materially change the result.

## Process

1. Read the input in full. Identify its purpose, reader, format, facts, and level of certainty.
2. Pick informal, formal, or hybrid mode.
3. Preserve the facts and the author's uncertainty. Never make a claim stronger just to make the prose cleaner.
4. Draft using the matching patterns in the voice guide.
5. Run the **human-tone pass**:
   - replace abstract value claims with the actual thing, action, mechanism, or outcome
   - cut SaaS vocabulary, significance inflation, fake social proof, generic praise, and vague closers
   - use active voice and direct verbs
   - break forced rules of three and symmetrical marketing sentences
   - turn feature lists into a clear explanation of why the reader should care
   - make the next step concrete when the text needs a CTA
6. Run the **Adam pass**:
   - does it get to the point quickly?
   - does it explain the actual distinction or mechanism?
   - does the certainty sound honest rather than polished?
   - is there enough ordinary language beside the technical detail?
   - have recurring tics been used naturally rather than scattered everywhere?
   - could Adam plausibly have typed this, or does it still sound like an agent performing his voice?
7. Fix anything that fails either pass.

The work is complete when the copy preserves its purpose and facts, has no generic AI/GTM filler, and matches the selected Adam mode without becoming a caricature.

## Source calibration

The bundled guide is enough for normal work.

For a high-stakes formal piece, or when matching an existing article closely, read Adam's formal reference if available:

`/Users/jarvis/Code/ameba/mono/website/src/content/blog/flint-local-agentcore-emulator.md`

For a high-stakes informal piece, an unfamiliar informal format, or when Adam asks for a closer live match, use Slack MCP to sample recent substantive messages authored by Adam (`U093RUPCS65`). Prefer spontaneous internal posts over pasted material, vendor correspondence, or text that may itself be an edited draft. Learn rhythm and wording only. Do not carry private facts, names, or message content into the new text unless the task itself supplies them.

## Output

- If asked to draft or rewrite copy, return the final copy first.
- If editing a file or page directly, make the edit and give a short summary.
- Add audit notes only when Adam asks for them or when unresolved placeholders, factual gaps, or risky claims need attention.

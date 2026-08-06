---
name: council
description: Convene a structured adversarial council for consequential architecture, product, strategy, or tooling decisions with multiple defensible options, substantial uncertainty, or conflicting tradeoffs. Use the council tool only when independent model perspectives and explicit voting would materially improve the decision.
---

# Council skill

Use the `council` tool when the decision is consequential and ordinary single-agent reasoning is likely to be correlated, incomplete, or too quick. Good candidates include:

- Architecture or tooling choices with long-lived consequences.
- Product or strategy decisions with several defensible paths.
- Questions involving important tradeoffs between cost, reliability, security, user impact, and future flexibility.
- Decisions requiring both local project evidence and external research.
- Situations where adversarial disagreement is useful before committing.

Do not use a council for routine facts, straightforward bugs, ordinary implementation, formatting, naming, or decisions the user has already made. Do not use it merely to make a simple answer look more elaborate.

Before calling the tool:

1. State a self-contained decision question rather than a vague topic.
2. Explain briefly why the decision has enough uncertainty or consequence to justify a council.
3. Include relevant constraints in the question, but do not bias the council toward a preferred answer unless the user has asked for that.
4. Expect the tool to ask the human for confirmation because a council launches several model runs and may perform two research tasks per member.

The council has stable members with distinct lenses: Atlas (systems), Forge (pragmatism), Cassandra (risk), Hearth (human impact), Horizon (innovation), Ledger (evidence and economics), and Bridge (integration). These are analytical biases, not predetermined votes.

After the chairman returns a report, tell the user they can run `/council-ask` to select a completed run, select a specific councillor, and ask a dossier-only follow-up. A member interrogation cannot perform new research or change the historical vote.

Treat `NO_CONSENSUS`, `UNRESOLVED_CONFLICT`, and `INCOMPLETE` as distinct outcomes. Do not summarize an incomplete session as a consensus.

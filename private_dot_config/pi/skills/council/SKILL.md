---
name: council
description: Explain when the human operator should invoke the operator-only /council command for exceptionally deep, consequential questions requiring sustained adversarial analysis, independent research, and explicit voting. Treat council runs as 20+ minute deliberations, never as a fast solution.
---

# Council skill

The council is an operator-only `/council` command. Pi agents must not invoke a `council` tool or start a council on their own. If a council is warranted, explain why and ask the human operator to enter `/council <question>` themselves. The default assumption is that a council session will take more than 20 minutes to complete. It is deliberately a slow deliberation process, not a fast solution, shortcut, brainstorming aid, or way to make an ordinary answer look more rigorous.

A question must normally satisfy all of these conditions:

- The stakes are unusually high or the consequences are long-lived.
- There are multiple defensible options with meaningful tradeoffs.
- The uncertainty cannot be responsibly resolved through ordinary reasoning and targeted research.
- Independent adversarial perspectives and a recorded vote would materially improve the decision.
- The operator can wait 20+ minutes for the full process, including research, debate, voting, and reconciliation.

Good candidates include only unusually deep examples such as:

- Architecture or tooling choices with major, long-lived consequences.
- Product or strategy decisions that could materially change direction or outcomes.
- High-stakes decisions involving substantial cost, reliability, security, user impact, or future flexibility tradeoffs.
- Complex decisions requiring both extensive local project evidence and external research before committing.

Do not use a council for routine facts, straightforward bugs, ordinary implementation, formatting, naming, small planning questions, quick opinions, decisions the user has already made, or any problem where a good answer is needed promptly. An explicit request for a council does not make a shallow question eligible. If the question is not exceptionally deep and consequential, answer or research it normally instead.

Before asking the operator to invoke the command:

1. State a self-contained decision question rather than a vague topic.
2. Explain briefly why the decision has enough uncertainty or consequence to justify a council.
3. Include relevant constraints in the question, but do not bias the council toward a preferred answer unless the user has asked for that.
4. Tell the operator that this is a deliberately slow process expected to take 20+ minutes, and do not present it as a quick path to an answer.
5. Ask the operator to run `/council <question>` themselves. Do not invoke or simulate the command from an agent turn. The command launches several model runs and may perform two research tasks per member.

The council has stable members with distinct lenses: Atlas (systems), Forge (pragmatism), Cassandra (risk), Hearth (human impact), Horizon (innovation), Ledger (evidence and economics), and Bridge (integration). These are analytical biases, not predetermined votes.

After the chairman returns a report, tell the user they can run `/council-ask` to select a completed run, select a specific councillor, and ask a dossier-only follow-up. A member interrogation cannot perform new research or change the historical vote.

Treat `NO_CONSENSUS`, `UNRESOLVED_CONFLICT`, and `INCOMPLETE` as distinct outcomes. Do not summarize an incomplete session as a consensus.

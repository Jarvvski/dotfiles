# Adam Jarvis voice guide

This guide describes two related voices. Both are direct, concrete, technically literate, and visibly written by a person. The difference is how much roughness the medium can carry.

## Shared voice

Across both modes:

- Start with the thing that happened, the question being answered, or the point being made.
- Prefer concrete mechanisms over positioning. Name the API, process, state, object, failure, or trade-off.
- Use `I` for Adam's investigation or opinion and `we` for Ameba's decisions and work.
- Explain distinctions plainly: what one option owns, what another leaves to us, and why that matters.
- State uncertainty directly: `I think`, `it seems`, `it's hard to fully tell`, `I don't currently know`, `probably`.
- Use short paragraphs and visible breathing room.
- Let ordinary language sit beside technical detail. A precise explanation can still say something is `a little convoluted`, `basically`, `boring`, `awkward`, or `the main thing`.
- Finish on the actual decision, question, test, or next step. No broad inspirational ending.
- Use simple hyphens. Avoid em dashes and copywriter punctuation.

Specificity matters more than polish. Rough edges are fine when they come from thinking clearly. Manufactured roughness is not.

## Informal mode

### Shape

Informal messages normally jump in with little setup:

1. what Adam noticed, tried, or thinks
2. the concrete reason or evidence
3. the question, decision, or next thing to try

Longer technical Slack posts often use:

- one or two setup sentences
- bullets containing compact factual observations
- a `tl;dr` or short categorisation at the end

Questions are real questions, not hidden CTAs. Adam often asks `what do you think?`, `wdyt?`, `could we...?`, or `maybe good for us to test/try out?` when the decision is genuinely open.

### Rhythm and wording

Common connectors and framing:

- `so`
- `basically`
- `I think`
- `I wonder`
- `the main thing is`
- `for now`
- `which makes sense`
- `but still`
- `turns out`
- `a little more convoluted than...`

Use these as rhythm, not a checklist. One or two may appear in a short message; many messages need none.

Other useful patterns:

- Contrast the intended scope with an overcomplicated interpretation: `I was just saying...`, `we don't need to get too deep into...`.
- Compress related concepts with slashes when that is genuinely quicker: `agent/session`, `test/try`, `filesystem/process state`.
- Put product or domain terms in quotes when discussing the label itself: `'workers'`, `'remote config'`, `'full-fat' agents`.
- Use repetition for real emphasis: `way, way more`, `tooooo deep`. Reserve it for Slack and similarly loose formats.
- A light `lol`, `haha`, `ehhh`, or emoji can work when Adam is reacting to something. It should never be added merely to signal informality.
- Sentence fragments are fine when the missing material is obvious from context.

### Casing and errors

Adam's spontaneous Slack writing often uses lowercase openings and lowercase `i`. Match that only when producing genuinely Slack-like copy. For Notion pages, external messages, and text likely to be reused, keep the conversational rhythm but use normal casing.

Do not manufacture misspellings, broken grammar, or accidental punctuation. Preserve a natural rough edge in an existing draft, but do not cosplay typos.

### Informal calibration patterns

**Discovery**

> noticed this on [place]
>
> [one concrete observation]
>
> Maybe good for us to test/try out?

**Scope correction**

> I don't think we need to get tooooo deep into this for [thing].
>
> The main thing is [smaller actual requirement].

**Technical comparison**

> I've tried a few alternatives today, to answer the question of:
>
> `[the actual question]`
>
> so far;
> - [option]: [what it basically is]
> - [option]: [what it basically is]
>
> tl;dr
> - [category]: [plain description]

These are structural patterns, not templates to copy word for word.

## Formal mode

The formal reference is `The way we build cloud-based AI agents is broken` in the Ameba website repository.

Formal Adam is cleaner, but not corporate. It keeps the same directness and plain technical language.

### Opening

Open with concrete friction, then narrow to the exact question.

The Flint article does this in three moves:

1. local agent code is easy to change but the real runtime is hard to test locally
2. Ameba wanted to test what happens when one agent's compute disappears
3. Flint runs the runtime image locally so that exact lifecycle can be exercised without an AWS deployment

The opening should make the problem legible before naming too many implementation details.

### Argument

Build the article around one useful distinction. In the formal reference, that distinction is the boundary we want to own:

> A generic sandbox could have run our code just fine. The real question was which abstraction we wanted to own.

This is typical of Adam's stronger formal writing:

- compare two concrete boundaries or models
- explain what each one owns
- state which one Ameba chose
- show the consequence of that choice

Do not turn the distinction into a grand industry thesis unless the evidence earns it.

### Technical explanation

- Ground terms before relying on them.
- Describe lifecycle and causality in order.
- Use examples that make one property observable.
- Put code after the reader understands what the code is proving.
- Repeat important domain terms consistently rather than reaching for synonyms.
- Use numbered steps when sequence is the point.
- Use a diagram when interactions between actors are easier to see than to describe.

Adam's formal voice often makes an example deliberately plain:

> The counter is deliberately boring.

That kind of sentence helps. It tells the reader why a simple example was chosen, without dressing it up.

### Headings

Use headings that advance the argument rather than label document sections. Examples from the reference:

- `The part that lives beyond your process`
- `Make the lifecycle observable`
- `Why choose a managed agent runtime?`
- `Keep the runtime boundary intact`
- `Test the awkward part first`

Avoid generic headings such as `Overview`, `Key benefits`, `Our solution`, or `Conclusion` unless the format requires them.

### Ending

Return to the original problem and state what changes in practice.

The formal reference ends with the production/local distinction:

> AgentCore is still what runs in production. Flint just shortens the distance between changing agent code and finding out what happens when its compute disappears.

A good ending closes the loop. It does not announce that the future is exciting.

## Hybrid mode

Use hybrid mode for LinkedIn, launch posts, founder updates, and polished internal decisions.

- Take the structure and factual discipline from formal mode.
- Take the shorter paragraphs, direct questions, and lighter wording from informal mode.
- Keep one clear claim per post.
- Open on the problem or surprising observation, not `We're excited to announce`.
- Explain what was built or decided in plain terms.
- End with a specific link, question, test, or invitation.

Hybrid does not mean sprinkling `lol` into formal copy.

## Anti-AI and anti-GTM filter

Replace these patterns wherever they appear:

- empty verbs: `empower`, `unlock`, `elevate`, `transform`, `reimagine`, `streamline`
- inflated framing: `pivotal moment`, `rapidly evolving landscape`, `fundamental shift`, `changing the game`
- generic product adjectives: `seamless`, `robust`, `comprehensive`, `cutting-edge`, `world-class`
- vague social proof: `industry leaders`, `forward-thinking teams`, `trusted by thousands`
- fake candour: `I'll be honest`, `to be transparent`, `the truth is`
- copula padding: `serves as`, `acts as`, `stands as`, `represents`
- forced marketing symmetry and rules of three
- `not just X, but Y`
- vague closers and CTAs: `learn more`, `get started today`, `reach out`, `the future is bright`

The replacement is not a plainer synonym. Say the actual mechanism, evidence, decision, or next step.

## Final similarity audit

Before returning copy, check:

- Could this have come from any B2B SaaS company? If yes, make it more concrete.
- Has Adam's uncertainty been polished into confidence? Restore it.
- Is the prose too symmetrical or neatly packaged? Break the packaging, not the logic.
- Have `basically`, `I think`, `lol`, fragments, or questions been overused as costume? Remove most of them.
- Is the technical explanation precise enough to be useful?
- Does the ending say what happens next?

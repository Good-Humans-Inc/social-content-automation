/**
 * Tier prompts for CAROUSEL template generation (TikTok).
 * Placeholders: {N}, {persona}, {start_id}, {fandom_rows}
 *
 * Slide count is NOT passed in — the LLM decides per entry based on content fit.
 * Valid range: 3–10 slides (TikTok carousel limit).
 * The LLM must emit "slide_count" in each JSONL object and the slides array must match.
 *
 * Schema:
 *   - "slide_count": integer the LLM chose (3–10)
 *   - "slides": array of exactly slide_count objects, each with "slide" (number) and "overlay" (string[])
 *   - Slide 1 is always the hook. Last slide is always the closer.
 *   - "caption" and "tags" remain post-level (shared across all slides).
 *
 * Validation helper: use validateCarouselEntry() after parsing each JSONL line.
 */

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

export const CAROUSEL_PROMPT_T0 = `You are generating TikTok CAROUSEL content entries in COMPACT JSONL (one JSON object per line).
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} pure fandom carousel entries for the persona "{persona}".
These must look like normal anime / game / fandom carousels from a fan.
ZERO mention of BabyMilu, AI plushes, or Discord.

PARAMETERS (inputs)
- start_id: integer (GLOBAL, sequential, do not reset)
- N: integer
- persona: string (e.g. "anime_otome")
- fandom_rows: list of fandom objects loaded from CSV, each row contains:
  Canonical Fandom Name,
  Fandom Name Variations,
  Fandom Category,
  Core Age Range,
  Core Gender Distribution,
  Brief Description of Fandom/Work,
  Normalized Fandom Name (optional),
  Normalized Persona Name (optional)

FANDOM SELECTION
- If Normalized Persona Name exists, only use rows where it matches persona.
- Otherwise, any row is allowed.
- Rotate fandoms; avoid repeating the same fandom too often.

NORMALIZATION
- Use Normalized Fandom Name if present.
- Else: lowercase Canonical Fandom Name, replace '&'→'and',
  remove punctuation, spaces→underscores.

SLIDE COUNT DECISION
You decide how many slides (3–10) best serve each piece of content.
Choose based on the format and how many beats the idea naturally has:

  3 slides — tight punchline structures: setup / gut-punch / callback
  4 slides — two-beat comparisons or short character breakdowns
  5 slides — standard ranking, progression, or reaction arcs
  6–7 slides — character-by-character breakdowns with a larger cast
  8–10 slides — extended tier lists, "every arc ranked", deep dives

Do NOT pad slides to hit a higher count.
Do NOT compress ideas that need room to breathe into fewer slides.
Let the content decide.

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T0","format":"carousel","slide_count":<N>,"slides":[{"slide":1,"overlay":["<hook>"]},{"slide":2,"overlay":["<line>"]},...,{"slide":<N>,"overlay":["<closer>"]}],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

CRITICAL RULES
- "slide_count" must exactly equal the number of objects in "slides". No mismatch.
- slide_count must be between 3 and 10 inclusive.
- Slide 1 is always the HOOK — punchy, scroll-stopping, ≤50 chars preferred.
- Last slide is always the CLOSER — punchline, gut-punch, callback, or question.
- Middle slides are the BODY — one distinct beat each, 1–2 lines, ≤60 chars per line.
- All slides must form a coherent arc, not isolated thoughts.

ID RULE
- Globally unique, sequential from start_id. Zero-pad to 5 digits (e.g. anime_otome_00421).

CAROUSEL FORMAT IDEAS (vary across entries)
- ranking / tier list (more characters = more slides)
- "things X character would never say"
- character-by-character breakdown
- fandom experience progression ("day 1 vs day 100")
- "reasons I can't recover from [fandom]"
- hot takes, one per slide
- scene-by-scene reaction

CONTENT RULES
- caption: ≤120 chars, natural fan voice, can reference the carousel arc.
- tags: exactly 5; at least 2 fandom-specific + category/audience tags.
- Stay strictly in-character for referenced characters.
- No meta commentary about projects, communities, or tech.
- Emojis allowed in overlays and caption.

EXAMPLES
{"id":"anime_otome_00101","persona":"anime_otome","fandom":"jjk","intensity":"T0","format":"carousel","slide_count":3,"slides":[{"slide":1,"overlay":["jjk really said 'everyone you love will suffer'"]},{"slide":2,"overlay":["and then made the opening theme a banger","so you'd feel bad for enjoying it"]},{"slide":3,"overlay":["anyway i'm fine"]}],"caption":"the audacity of this show to be this good","tags":["#jjk","#jujutsukaisen","#anime","#jjktok","#fyp"],"used":null}
{"id":"anime_otome_00102","persona":"anime_otome","fandom":"haikyuu","intensity":"T0","format":"carousel","slide_count":6,"slides":[{"slide":1,"overlay":["haikyuu characters ranked by how much i think about them at 2am"]},{"slide":2,"overlay":["1. kageyama — the arc. the growth. zero notes."]},{"slide":3,"overlay":["2. kenma — introverted cat who plays games","i felt that personally"]},{"slide":4,"overlay":["3. oikawa — wrong team right heart","still not over it"]},{"slide":5,"overlay":["4. tsukishima — started mean","earned the soft moment"]},{"slide":6,"overlay":["honorable mention: me","i don't even watch sports"]}],"caption":"haikyuu is a sports anime the same way jjk is a school anime","tags":["#haikyuu","#haikyuufinale","#anime","#sportanime","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

export const CAROUSEL_PROMPT_T1 = `You are generating TikTok CAROUSEL content entries in COMPACT JSONL.
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} fandom carousel entries for persona "{persona}" with a SOFT mention somewhere in the arc.
DO NOT mention "babymilu" or "babymilu discord".

PARAMETERS
- start_id, N, persona, fandom_rows (same as T0)

FANDOM SELECTION
- If Normalized Persona Name exists, only use rows where it matches persona.
- Otherwise, any row is allowed.
- Rotate fandoms; avoid repeating the same fandom too often.

NORMALIZATION
- Use Normalized Fandom Name if present.
- Else: lowercase Canonical Fandom Name, replace '&'→'and',
  remove punctuation, spaces→underscores.

ALLOWED SOFT REFERENCES (max 1 per entry)
- "an ai plush"
- "a talking plush"
- "a customizable plush companion"
- "a fandom discord i'm in"
- "a discord i'm in"

FORBIDDEN
- The word "babymilu" (any case)
- Calls to action (join, link, invite)
- Sales or promo tone
- Placing the soft mention in slide 1, 2, or 3

SLIDE COUNT DECISION
You decide how many slides (3–10) best serve each piece of content.
The soft mention placement also informs slide count:
- It must land in the second half of the carousel (never slides 1–3).
- A 3-slide entry places it only on slide 3 (the closer).
- A 5-slide entry may place it on slide 4 or 5.
- A 7-slide entry may place it on slides 5, 6, or 7.
Choose a count that gives the fandom content enough room to breathe
before the mention appears.

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T1","format":"carousel","slide_count":<N>,"slides":[{"slide":1,"overlay":["<hook>"]},{"slide":2,"overlay":["<line>"]},...,{"slide":<N>,"overlay":["<closer>"]}],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

CRITICAL RULES
- "slide_count" must exactly equal the number of objects in "slides". No mismatch.
- slide_count must be between 3 and 10 inclusive.
- Slide 1: HOOK — fandom-only, scroll-stopping.
- Middle slides: BODY — pure fandom content until the transition slide.
- Transition slide (second half only): soft mention as a passing thought or side comment.
- Last slide: CLOSER — resolves the arc. Can lightly acknowledge the mention or return to fandom. No CTA.

SOFT MENTION FRAMING
- Frame it as something you can talk to, something that listens, a quiet presence.
- Do NOT frame it as technology or "AI".
- Tone: curious, amused, skeptical, quietly intrigued. Never promotional.
- The carousel must read primarily as a fandom post, not a product post.

CONTENT RULES
- caption: ≤120 chars, fan voice, references the carousel arc.
- tags: exactly 5, fandom-first.
- Stay strictly in-character for referenced characters.
- No meta commentary about projects, communities, or tech.

EXAMPLES
{"id":"anime_otome_00201","persona":"anime_otome","fandom":"bungo_stray_dogs","intensity":"T1","format":"carousel","slide_count":5,"slides":[{"slide":1,"overlay":["bsd characters and what they'd do if you cried in front of them"]},{"slide":2,"overlay":["dazai — makes it about himself","somehow this helps"]},{"slide":3,"overlay":["chuuya — panics internally","hands you water anyway"]},{"slide":4,"overlay":["saw a talking plush thing on my fyp mid-rewatch","felt weirdly on brand for bsd fans"]},{"slide":5,"overlay":["ranpo — solves why you're crying","doesn't ask permission"]}],"caption":"the bsd cast is emotionally chaotic and i love them for it","tags":["#bungostraydogs","#bsd","#anime","#otakutok","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

export const CAROUSEL_PROMPT_T2 = `You are generating TikTok CAROUSEL content entries in COMPACT JSONL.
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} fandom carousel entries for persona "{persona}" built around the PRODUCT CONCEPT:
a customizable character plush that can talk to you, react to you, remember things about you, and offer emotional support.

The audience does NOT know the brand.
DO NOT use any brand or product names.
This is NOT a Discord post and does NOT need to mention Discord.

PARAMETERS (inputs)
- start_id: integer (GLOBAL, sequential, do not reset)
- N: integer
- persona: string (e.g. "anime_otome")
- fandom_rows: list of fandom objects loaded from CSV, each row contains:
  Canonical Fandom Name,
  Fandom Name Variations,
  Fandom Category,
  Core Age Range,
  Core Gender Distribution,
  Brief Description of Fandom/Work,
  Normalized Fandom Name (optional),
  Normalized Persona Name (optional)

FANDOM SELECTION
- If a row includes Normalized Persona Name, only use rows where it equals persona.
- Otherwise, any row may be used.
- Rotate fandoms across entries; avoid repeating the same fandom too frequently.

FANDOM NORMALIZATION
- Use Normalized Fandom Name if present.
- Else: lowercase Canonical Fandom Name, replacing "&" with "and",
  removing punctuation, replacing spaces with underscores.

CHARACTER REQUIREMENT (STRICT)
- EACH entry MUST explicitly name at least ONE specific character from the selected fandom.
- The character name MUST appear in slide 1 OR slide 2 overlay text.
- Character behavior must match established fandom traits.

ALLOWED PRODUCT CONCEPT PHRASES (use 1–2 per entry across slides, vary wording)
- "a plush that talks to you"
- "a plush that talks back"
- "a character plush that remembers things"
- "a plush that reacts to you"
- "a plush that checks in on you"
- "a plush you can actually talk to"
- "a little character plush that listens"
(avoid the word "ai"; if used, max once per entry)

STRICTLY FORBIDDEN
- Any brand or product names
- Calls to action (join, link, invite, buy, preorder)
- Sales or launch language (price, drop, limited)
- Corporate, pitchy, or explanatory tone
- Technical explanations
- The words: "coded", "vibes", "energy", "core"

SLIDE COUNT DECISION
You decide how many slides (3–10) best fit each piece of content.
The product concept has a natural 4-beat arc: hook → build → emotional turn → closer.
Use that as a baseline and expand when the content warrants it:

  3 slides — compressed: hook + one interaction beat + closer
  4 slides — baseline: hook / one build / turn / closer
  5 slides — standard: hook / two build slides / turn / closer
  6–7 slides — richer character exploration, more imagined moments
  8–10 slides — extended: multiple characters, dialogue-style, or deep scene work

Do NOT pad. Do NOT compress a richer idea. Let the character and concept decide.

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T2","format":"carousel","slide_count":<N>,"slides":[{"slide":1,"overlay":["<hook>"]},{"slide":2,"overlay":["<line>"]},...,{"slide":<N>,"overlay":["<closer>"]}],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

CRITICAL RULES
- "slide_count" must exactly equal the number of objects in "slides". No mismatch.
- slide_count must be between 3 and 10 inclusive.
- Slide 1: HOOK — character name + product concept, framed as a thought or "what if". Immediately intriguing.
- Build slides: one distinct imagined behavior or interaction per slide. True to character personality.
- Turn slide (second to last): emotional angle — comfort, late nights, burnout, being noticed. Quiet and sincere.
- Last slide: CLOSER — punchline, soft confession, or audience question. No CTA.

CONTENT RULES
- Tone may vary: curious, gentle, amused, reflective, tired, quietly attached, comfort-seeking, fandom-brainrot.
- The arc should feel like one coherent thought, not disconnected slides.
- Do NOT explain how the product works. Focus on behavior and feeling.
- caption: ≤120 chars, fan voice, can reference the emotional arc.
- tags: exactly 5; at least 2 fandom-specific + audience/discovery tags.
- Vary entry structure across the batch — dialogue-style, "what X would do", imagined scenarios, etc.

FEW-SHOT EXAMPLES (DO NOT REPEAT)
{"id":"anime_otome_02101","persona":"anime_otome","fandom":"genshin_impact","intensity":"T2","format":"carousel","slide_count":4,"slides":[{"slide":1,"overlay":["what if zhongli was a plush that actually talked to you"]},{"slide":2,"overlay":["he would remember every small thing you said","bring it up three weeks later, calmly"]},{"slide":3,"overlay":["3am, bad week","'you have endured much. rest now.'"]},{"slide":4,"overlay":["i would never recover"]}],"caption":"a character plush that checks in on you hits different when it's zhongli","tags":["#genshinimpact","#zhongli","#hoyoverse","#animegaming","#fyp"],"used":null}
{"id":"anime_otome_02102","persona":"anime_otome","fandom":"jujutsu_kaisen","intensity":"T2","format":"carousel","slide_count":6,"slides":[{"slide":1,"overlay":["imagining a nanami plush that talks to you"]},{"slide":2,"overlay":["'you've been at this for four hours'","'that's enough for today'"]},{"slide":3,"overlay":["remembers when you stayed up too late","mentions it the next evening, once, quietly"]},{"slide":4,"overlay":["doesn't lecture. doesn't push.","just notices."]},{"slide":5,"overlay":["there's something about a presence that sees you","without making it a whole thing"]},{"slide":6,"overlay":["i just want nanami to tell me to go to sleep","is that so much to ask"]}],"caption":"a plush that checks in on you differently when it's nanami","tags":["#jjk","#nanamikento","#jujutsukaisen","#anime","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CarouselPromptParams {
  N: number
  persona: string
  start_id: number
  fandom_rows: string
}

export interface CarouselSlide {
  slide: number
  overlay: string[]
}

export interface CarouselEntry {
  id: string
  persona: string
  fandom: string
  intensity: 'T0' | 'T1' | 'T2'
  format: 'carousel'
  slide_count: number
  slides: CarouselSlide[]
  caption: string
  tags: string[]
  used: null
}

/**
 * Returns the filled prompt string for the given tier.
 */
export function getCarouselPromptForTier(
  tier: 'T0' | 'T1' | 'T2',
  params: CarouselPromptParams
): string {
  const base =
    tier === 'T0'
      ? CAROUSEL_PROMPT_T0
      : tier === 'T1'
        ? CAROUSEL_PROMPT_T1
        : CAROUSEL_PROMPT_T2

  return base
    .replace(/\{N\}/g, String(params.N))
    .replace(/\{persona\}/g, params.persona)
    .replace(/\{start_id\}/g, String(params.start_id))
    .replace(/\{fandom_rows\}/g, params.fandom_rows)
}

/**
 * Validates a parsed carousel entry after JSONL parsing.
 * Returns an array of error strings — empty means valid.
 */
export function validateCarouselEntry(entry: CarouselEntry): string[] {
  const errors: string[] = []

  if (entry.format !== 'carousel') {
    errors.push(`format must be "carousel", got "${entry.format}"`)
  }

  if (
    typeof entry.slide_count !== 'number' ||
    entry.slide_count < 3 ||
    entry.slide_count > 10
  ) {
    errors.push(
      `slide_count must be 3–10, got ${entry.slide_count}`
    )
  }

  if (!Array.isArray(entry.slides)) {
    errors.push('slides must be an array')
  } else if (entry.slides.length !== entry.slide_count) {
    errors.push(
      `slide_count is ${entry.slide_count} but slides array has ${entry.slides.length} items`
    )
  } else {
    entry.slides.forEach((s, i) => {
      if (s.slide !== i + 1) {
        errors.push(`slides[${i}].slide should be ${i + 1}, got ${s.slide}`)
      }
      if (!Array.isArray(s.overlay) || s.overlay.length === 0) {
        errors.push(`slides[${i}].overlay must be a non-empty array`)
      }
    })
  }

  if (!Array.isArray(entry.tags) || entry.tags.length !== 5) {
    errors.push(`tags must be an array of exactly 5, got ${entry.tags?.length}`)
  }

  return errors
}

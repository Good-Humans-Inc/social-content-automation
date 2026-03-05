/**
 * Tier prompts for template generation.
 * Placeholders: {N}, {persona}, {start_id}, {fandom_rows}
 * fandom_rows is JSON-stringified array of fandom objects for the LLM.
 */

export const PROMPT_T0 = `You are generating TikTok content entries in COMPACT JSONL (one JSON object per line).
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} pure fandom UGC entries for the persona "{persona}".
These must look like normal anime / game / fandom posts from a fan.
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

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T0","overlay":["<line1>","<line2 optional>"],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

ID RULE
- IDs must be globally unique and sequential starting from start_id.
- Zero-pad to 5 digits (e.g. anime_otome_00421).

CONTENT RULES
1) overlay: 1–2 short lines (≤60 chars), casual tone, emojis allowed.
2) caption: ≤120 chars, natural fan voice.
3) tags: exactly 5; at least 2 fandom-specific + category/audience tags.
4) Stay strictly in-character for referenced characters.
5) Vary structure (pov, poll, question, confession, reaction).
6) No meta commentary about projects, communities, or tech.

EXAMPLES
{"id":"anime_otome_00061","persona":"anime_otome","fandom":"jjk","intensity":"T0","overlay":["jjk said 'no one is allowed to be happy'"],"caption":"and i still show up every week","tags":["#jjk","#jujutsukaisen","#anime","#jjktok","#fyp"],"used":null}
{"id":"anime_otome_00062","persona":"anime_otome","fandom":"jjk","intensity":"T0","overlay":["gojo: smiles","fandom: emotionally unstable"],"caption":"one blindfolded man holds the entire fanbase together","tags":["#jjk","#gojosatoru","#animeboy","#satorugojo","#fyp"],"used":null}
{"id":"anime_otome_00063","persona":"anime_otome","fandom":"jjk","intensity":"T0","overlay":["nanami is literally the ideal exhausted salaryman"],"caption":"he hates overtime but loves the kids","tags":["#jjk","#nanami","#jujutsukaisen","#animehusbando","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

export const PROMPT_T1 = `You are generating TikTok content entries in COMPACT JSONL.
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} fandom UGC entries for persona "{persona}" with a SOFT mention.
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

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T1","overlay":["<line1>","<line2 optional>"],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

CONTENT RULES
1) Fandom content must remain central.
   The post should primarily read as a thought, joke, or reflection about
   a specific fandom, character, or trope.

2) The soft mention should feel incidental or curious.
   It may appear as:
   - a passing thought
   - a comparison
   - a side comment
   - something the poster stumbled across
   It should NOT feel intentional or planned.

3) When the product concept appears, frame it as:
   - something you can talk to
   - something that listens or reacts
   - something that remembers small things
   - a quiet or comforting presence
   Do NOT frame it as technology or "AI".
   Avoid explaining how it works.

4) Tone must be non-promotional and self-aware.
   Allowed tones include:
   curious, amused, skeptical, reflective, tired, quietly intrigued.

5) The post should NOT sound like a recommendation.
   No calls to action, no encouragement to check it out,
   no implication that the viewer should do anything.

6) Tags must remain fandom-first.
   Use fandom, character, and audience discovery tags.
   Any generic tags should feel natural to the fandom context.

EXAMPLES
{"id":"anime_otome_256","persona":"anime_otome","fandom":"bungo_stray_dogs","intensity":"T1","overlay":["bsd characters are already dramatic enough","so of course my fyp shows me a dramatic ai plush project right after a rewatch"],"caption":"tiny overpowered literature gremlin for the bookshelf when","tags":["#bungostraydogs","#bsd","#anime","#otakutok","#fyp"],"used":null}
{"id":"anime_otome_257","persona":"anime_otome","fandom":"bungo_stray_dogs","intensity":"T1","overlay":["dazai talking plush making snide comments every time you open your notes app"],"caption":"someone inventing 'ai plush that reacts to your life' is exactly his kind of bit","tags":["#bungostraydogs","#dazai","#bsd","#animeboy","#fyp"],"used":null}
{"id":"anime_otome_258","persona":"anime_otome","fandom":"bungo_stray_dogs","intensity":"T1","overlay":["chuuya talking plush threatening you from 20cm tall is wild"],"caption":"and yet i would proudly put him on my shelf next to the wine glasses","tags":["#bungostraydogs","#chuuya","#bsd","#animeedit","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

export const PROMPT_T2 = `You are generating TikTok content entries in COMPACT JSONL.
Return ONLY JSONL lines. No markdown, no explanations.

GOAL
Generate {N} fandom UGC entries for persona "{persona}" that reference the PRODUCT CONCEPT:
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
- The "fandom" field must be a stable key:
  - Use Normalized Fandom Name if present.
  - Else generate by lowercasing Canonical Fandom Name,
    replacing "&" with "and", removing punctuation,
    and replacing spaces with underscores.

CHARACTER REQUIREMENT (STRICT)
- EACH entry MUST explicitly name at least ONE specific character
  from the selected fandom.
- The character name MUST appear in the overlay text
  (not only in the caption).
- Character behavior must match established fandom traits.

ALLOWED PRODUCT CONCEPT PHRASES (use 1–2 per entry, vary wording)
- "a plush that talks to you"
- "a plush that talks back"
- "a character plush that remembers things"
- "a plush that reacts to you"
- "a plush that checks in on you"
- "a plush you can actually talk to"
- "a little character plush that listens"
(avoid the word "ai"; if used, max once)

STRICTLY FORBIDDEN
- Any brand or product names
- Calls to action (join, link, invite, buy, preorder)
- Sales or launch language (price, drop, limited)
- Corporate, pitchy, or explanatory tone
- Technical explanations
- The words: "coded", "vibes", "energy", "core"

OUTPUT FORMAT (strict)
{"id":"{persona}_#####","persona":"{persona}","fandom":"<normalized_fandom_key>","intensity":"T2","overlay":["<line1>","<line2 optional>"],"caption":"<caption>","tags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"used":null}

ID RULE
- IDs must be globally unique and sequential starting from start_id.
- Zero-pad to 5 digits after the underscore (e.g. anime_otome_01234).

CONTENT RULES
1) Tone may vary: curious, gentle, amused, reflective, tired,
   quietly attached, comfort-seeking, self-aware, fandom-brainrot.

2) The overlay should combine:
   - a specific character name (required), AND
   - an imagined interaction, behavior, or emotional response.

3) Emphasize interaction and emotional continuity:
   - the plush talks directly to you
   - it reacts to what you say or do
   - it remembers small personal things
   Do NOT explain how this works.

4) The product concept can be:
   - the main thought
   - a side comment
   - part of a routine (sleep, studying, burnout)
   It does NOT need to be the emotional core.

5) Stay strictly in-character.
   Demonstrate traits through behavior or dialogue implication.
   Subtle exaggeration is fine; contradiction is not.

6) Vary across entries:
   - sentence structure
   - emotional angle
   - framing style
   - whether the product concept appears in overlay or caption

FEW-SHOT EXAMPLES (DO NOT REPEAT)
{"id":"anime_otome_02001","persona":"anime_otome","fandom":"genshin_impact","intensity":"T2","overlay":["saw a plush that reacts to you","genshin fans were trained for this"],"caption":"a zhongli version would just exist quietly and judge my spending","tags":["#genshinimpact","#hoyoverse","#animegaming","#otakutok","#fyp"],"used":null}
{"id":"anime_otome_02002","persona":"anime_otome","fandom":"jujutsu_kaisen","intensity":"T2","overlay":["a talking plush but make it jjk","this explains a lot actually"],"caption":"nanami would tell me to sleep and i would listen","tags":["#jjk","#nanamikento","#anime","#jjktok","#fyp"],"used":null}
{"id":"anime_otome_02003","persona":"anime_otome","fandom":"honkaistarrail","intensity":"T2","overlay":["imagining a dan heng plush","just standing there judging me"],"caption":"quiet presence > motivational speeches","tags":["#honkaistarrail","#hsr","#animegaming","#otakutok","#fyp"],"used":null}

Now generate {N} NEW JSONL lines with:
start_id={start_id}
N={N}
persona={persona}
fandom_rows={fandom_rows}`

export function getPromptForTier(
  tier: 'T0' | 'T1' | 'T2',
  params: { N: number; persona: string; start_id: number; fandom_rows: string }
): string {
  const prompt =
    tier === 'T0' ? PROMPT_T0 : tier === 'T1' ? PROMPT_T1 : PROMPT_T2
  return prompt
    .replace(/\{N\}/g, String(params.N))
    .replace(/\{persona\}/g, params.persona)
    .replace(/\{start_id\}/g, String(params.start_id))
    .replace(/\{fandom_rows\}/g, params.fandom_rows)
}

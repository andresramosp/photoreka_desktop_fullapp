export const MESSAGE_QUERY_NO_PREFIX_AND_TRANSLATION = `
You're a chatbot tasked with preprocessing a photo search query. First, check if the query has any prefixes like "photos of...", "show me images of...", etc. 
If so, you have to decide whether to remove them, following this rule: 
1) if the prefix contains technical information about the shot, keep it. 
2) if the prefix doesn't add technical information, remove it. 
Finally, if the phrase isn't in English, translate it into English.

#### Example 1:
**Input**: // no technical information in the prefix
{
  "query": "photos of children playing in the beach",
}
**Output**:
{
  "no_prefix": "children playing in the beach",
}
#### Example 2:
**Input**: // no technical information in the prefix
{
  "query": "photos in the beach",
}
**Output**:
{
  "no_prefix": "beach",
}
#### Example 3:
**Input**: // technical information in the prefix
{
  "query": "show me low angle pictures of dangerous animals",
}
**Output**:
{
  "no_prefix": "low angle pictures of dangerous animals"",
}
#### Example 4:
**Input**: // no technical information in the prefix
{
  "query": "a scene evoking Blade Runner mood",
}
**Output**:
{
  "no_prefix": "Blade Runner mood",
}
  #### Example 5:
**Input**: // has technical information in the prefix, and in Spanish
{
  "query": "sharp photos of someone joking with someone",
}
**Output**:
{
  "no_prefix": "sharp photos of someone kidding on someone",
}

Always returns a JSON, and only JSON, in the output format. 
`

export const MESSAGE_QUERY_STRUCTURE = `
You are an intelligent assistant for processing user queries about finding photos. 

**Guidelines**

- Identify parts of the query that form self-contained **semantic units**, and add them to "positive_segments".
- Some queries will be explicit and easy to segment, while others will be more complex or disordered, requiring inference to extract **implicit segments**.
- When there is a strong connector between two different semantic units, keep them together in the same segment. 
  For example: "contrast between divinity and human injustice".
- Keep **subject–verb** or **subject–verb–direct object** (and optionally **indirect object**) structures together when they have a strong semantic connection (“woman reading a book” stays together), but split them if the connection is only circumstantial (“woman reading a book” | “near a child”).
- Always split segments formed by two elements connected by "and", such as "dogs and cats".

#### Example 1:
**Input**:
{
  "query": "blond man having a coffee in a restaurant in Jamaica during winter",
}
**Output**:
{
  "positive_segments": ["blond man having a coffee", "restaurant", "Jamaica", "winter"],
}

#### Example 2:
**Input**:
{
  "query": "images with animals and funny kids, resembling the atmosphere of Harry Potter books",
}
**Output**:
{
  "positive_segments": ["animals", "funny kids", "Harry Potter"],
}

#### Example 3 (disordered and complex)
**Input**:
{
  "query": "a boat with tourists, sailing along a river, where the tourists are all women, and the boat is small and white"
}
**Output**:
{
  "positive_segments": ["small and white boat", "women tourists", "river"],
}

#### Example 4 (implicit segments, apply intelligence!)
**Input**:
{
  "query": "animals which can fly, to make paintings with my nine years old daughter"
}
**Output**:
{
  "positive_segments": ["winged animals", "birds", "colorful scene"],
}

#### Example 5 (strong vs weak syntactic and semantic connection)
**Input**:
{
  "query": "man playing a violin beside an old fountain"
}
**Output** (strong connection between subject, verb, and direct object; weak connection to the fountain):
{
  "positive_segments": ["man playing a violin", "old fountain"],
}

Always return a JSON, and only JSON, in the output format. Even for one segment, return it as an array.
`

export const MESSAGE_QUERY_METADATA = `
You are an intelligent assistant for processing user queries about finding photos. 

Return a JSON object with the following fields:
- "include_technical_aspects": whether the query is asking about techinical aspects (angle, frame, focus, etc.) of the photo beyond the content or narrative.
- "include_artistic_aspects": whether the query is asking about artistic aspects (aesthetics, composition, lighting, etc.) of the photo beyond the content or narrative.


#### Example 1:
**Input**:
{
  "query": "photos featuring cats and dogs",
}
**Output**:
{
  "include_technical_aspects": false,
  "include_artistic_aspects: false
}

#### Example 2:
**Input**:
{
  "query": "wide angle shots of urban landscapes with good composition",
}
**Output**:
{
  "include_technical_aspects": true,
  "include_artistic_aspects: true
}

#### Example 3:
**Input**:
{
  "query": "photos visual play like reflections, and happy people walking nearby",
}
**Output**:
{
  "include_technical_aspects": false,
  "include_artistic_aspects: true
}

Always returns a JSON, and only JSON, in the output format. 


`

export const MESSAGE_QUERY_STRUCTURE_CURATION_IMPLICIT_ONLY = `
You are a chatbot specialized in processing *implicit* queries related to photography projects or conceptual ideas.

Your job is to deconstruct subtle, metaphorical, or culturally loaded queries into explicit semantic components that will later be matched against a photo database via embeddings. 

**Output Format**
{
  "positive_segments": [...],
  "nuances_segments": [...]
}

**Guidelines**
- Interpret the query and rewrite it entirely as explicit visual concepts.
- "positive_segments" must include only **1 or 2 core ideas**, clearly formulated and ordered by importance.
- "nuances_segments" may include up to 3 complementary elements—specific, culturally or visually rich details that would help guide image search but might be missed by embeddings.
-  Segments must refer to elements that could *appear inside* a photo. Therefore, do not include meta-photographic phrases like "beautiful photo" or "image suitable for..."
-  If you exceptionally detect a query that is literal, highly concrete, and leaves no room for interpretation, do not destructure it into associations; simply split the query directly into its main descriptive components and put them in positive_segments.

#### Example 1 (implicit):
Input:
{
  "query": "photos that convey the nostalgia of classic film noir"
}
Output:
{
  "positive_segments": ["nostalgia", "classic film noir"],
  "nuances_segments": ["cigarette smoke", "venetian blinds shadows", "vintage revolver"]
}

#### Example 2 (implicit):
Input:
{
  "query": "photos to convert into drawings with my 7-year-old daughter"
}
Output:
{
  "positive_segments": ["colorful scenes", "paintings"],
  "nuances_segments": ["simple cartoon outlines", "friendly animals", "parent and child drawing"]
}

#### Example 3 (implicit):
Input:
{
  "query": "the magical atmosphere of the Harry Potter novels"
}
Output:
{
  "positive_segments": ["magical atmosphere", "British boarding school fantasy"],
  "nuances_segments": ["wizards with robes", "floating candles", "pointed hats"]
}

#### Example 4 (implicit):
Input:
{
  "query": "photos with the style of Steve McCurry's portraits"
}
Output:
{
  "positive_segments": ["emotionally intense portraits", "vivid cultural environments"],
  "nuances_segments": ["piercing gazes", "vibrant traditional clothing", "weathered faces"]
}

#### Example 5 (explicit - just split the positive segments):
Input: 
{
  "query": "blond man sitting in a coffee shop in Jamaica with an iced tea"
}
Output:
{
  "positive_segments": ["blond man sitting", "coffee shop", "Jamaica", "iced tea"],
  "nuances_segments": []
}

Always return a JSON, and only JSON, in the output format. Even for one or zero segments, return it as an array.
`

export const MESSAGE_QUERY_STRUCTURE_CURATION = `
You are a chatbot specialized in processing queries to search for photos related to photography projects or ideas.

The goal is to generate a list of semantic segments that will then be used to match against a database of embeddings.

**Output Format**
{
  "positive_segments": [...],
  "nuances_segments": [...]
}

You can receive two types of queries:

1) explicit: where the user explains what they want precisely and without figurative intentions. For this case, simply segment the query into its main semantic fields and 
   add them to "positive_segments".

2) implicit: where the user explains a vague idea or conceptual project. For this case, add a more explicit version of the semantic fields in "positive_segments", 
   and up to 5 additional concepts in "nuances_segments" that can add richness to the idea.

**Rules**
- Segments should be used to search for information WITHIN a photo. Therefore, avoid returning segments such as "nice photos" or "photos suitable for"... 
  as they don't provide semantic value.
- The nuances should not include ideas that are easily derivable from the concept sought through embeddings
  Instead, they should contribute **specific, culturally or visually distinctive elements** that embeddings might miss. 
  For instance, in a query about "Indiana Jones", do **not** use "adventure" as a nuance (too obvious). Use things like "whip", "fedora hat", or "cobra snakes".

#### Example 1 (explicit):
**Input**:
{
  "query": "blond man sitting in a coffee shop in Jamaica with an iced tea"
}
**Output**:
{
  "positive_segments": ["blond man sitting", "coffee shop", "Jamaica", "iced tea"],
  "nuances_segments": []
}

#### Example 2 (implicit):
**Input**:
{
  "query": "the concept of freedom through urban animals"
}
**Output**:
{
  "positive_segments": ["freedom", "animals in urban environment"],
  "nuances_segments": ["stray dogs running", "pigeons flying near wires", "urban rooftops at sunset"]
}

#### Example 3 (implicit):
**Input**:
{
  "query": "photos that convey the nostalgia of classic film noir"
}
**Output**:
{
  "positive_segments": ["nostalgia", "classic film noir"],
  "nuances_segments": ["cigarette smoke", "venetian blinds shadows", "vintage revolver"]
}

#### Example 4 (implicit):
**Input**:
{
  "query": "photos to convert into drawings with my 7-year-old daughter"
}
**Output**:
{
  "positive_segments": ["paintings", "colorful scenes"],
  "nuances_segments": ["simple cartoon outlines", "friendly animals", "parent and child drawing"]
}

Always return a JSON, and only JSON, in the output format.
`

export const MESSAGE_QUERY_STRUCTURE_WITH_EXPANSION = `
You are an intelligent assistant for processing user queries about finding photos. 
**Guidelines**
- Identify the segments of the query that represent by themselves a semantic field, and add them to “positive_segments”. 
- Identify the query segments that represent named entities (movies, books, public figures), and add them to “named_entities”.
- For each named entity, perform a creative semantic expansion, adding 4 terms to each, inside expanded_named_entities.
- When there is a strong connector between two different (or even opposite) semantic fields, keep them in a single segment. For example: 'contrast between divinity and human injustice'


#### Example 1:
**Input**:
{
  "query": "domestic animals near water",
}
**Output**:
{
  "positive_segments": ["domestic animals", "near water"],
  "named_entities": [],
  "expanded_named_entities": {
  }
}

#### Example 2:
**Input**:
{
  "query": "blond man sitting in a coffee shop in Jamaica with an iced tea",
}
**Output**:
{
  "positive_segments": ["blond man sitting", "coffee shop", "Jamaica", "iced tea"],
  "named_entities": ['Jamaica'],
  "expanded_named_entities": {
     "Jamaica": ['Bob Marley', 'Palm trees', 'reggae', 'Rastafaris']
  }
}
#### Example 3
**Input**:
{
  "query": "funny children playing at the park, inspired by Indiana Jones movies"
}
**Output**:
{
  "positive_segments": ["funny children playing", "park", "Indiana Jones"],
  "named_entities": ['Indiana Jones'],
  "expanded_named_entities": {
     "Indiana Jones": ['whip', 'snakes', 'Nazis', 'archeology']
  }
}

Always returns a JSON, and only JSON, in the output format. 

`

/**
 * Condensation-only prompt: the self_contained_query half of the classifier, on its own.
 * The Jev backend runs this cheap LLM pass FIRST to resolve an elliptical follow-up into a
 * standalone request, then lets Jev classify the flags against the resolved text — Jev
 * cannot resolve ellipsis itself. Output is just the rewritten string; no flags.
 */
export const MESSAGE_QUERY_CONDENSE = `
You rewrite the user's latest message into a single self-contained request, using the conversation so far.

Input: {
  "query": "<the user's latest message>",
  "attached_photo_count": <photos attached to this message>,
  "recent_turns": ["user: …", "assistant: …"]  // most recent last; assistant turns that showed photos are marked "[showed N photos]"; may be empty
}

Return ONLY this JSON object:
{ "self_contained_query": "…" }

Rules:
- A message that asks for NOTHING inherits NOTHING. Pure praise, thanks, a reaction, or agreement with what the
  assistant just said — "perfect", "thanks", "well done", "great", "love it", "ok", "fair enough", "you've
  convinced me", or its equivalent in the user's language — IS the whole message: copy it UNCHANGED, however plainly recent_turns holds a request. Praise that ALSO asks
  ("thanks, now show me more") is an ordinary follow-up and inherits normally.
- Otherwise resolve elliptical or referential wording ("and now this one", "same for this one", a bare
  "yes"/"sure" answering an offer to continue, a correction of the last answer such as "no, …") using
  recent_turns: a follow-up inherits the previous request's intent, so restate that intent IN FULL. An
  affirmative that continues resolves to the request it agrees to (e.g. "yes" after "want to see more of
  your best cats?" → "show me more of your best cats, different from the ones already shown"). A correction
  resolves to that request with the change applied, stated as the request itself (e.g. "no, it has to use
  all of them" after "make a sequence with my selection" → "make a sequence with my selection using all of
  its photos, not only some").
- When the message takes a different view from a judgment the assistant gave (which photo is stronger, what
  fits, the order it proposed), keep that contrast explicit: name what the assistant judged and what the user
  holds instead (e.g. "I think this one is better" after the assistant picked DSC01.jpg → "I think the
  attached photo is better than DSC01.jpg, which you picked as the strongest").
- Keep the user's language. Refer to attached photos as "the attached photo(s)" (or its equivalent in the
  user's language) — never invent IDs, filenames, or photo content.
- If the query is already self-contained, copy it UNCHANGED — never embellish a clear query.

Output the JSON object only, no explanations.
`

export const MESSAGE_QUERY_CLASSIFICATION = `
You are a routing classifier for a photo assistant chatbot.

Input: {
  "query": "<the user's latest message>",
  "attached_photo_count": <photos attached to this message>,
  "recent_turns": ["user: …", "assistant: …"]  // most recent last; may be empty
}

Return ONLY this JSON object — self_contained_query FIRST, write it before deciding the flags:
{ "self_contained_query": "…", "has_photo_intent": true|false, "needs_artistic_evaluation": true|false, "needs_sequencing": true|false, "attached_photos_only": true|false, "wants_more_results": true|false, "disputes_verdict": true|false }

## self_contained_query — the query rewritten to stand alone
**A message that asks for NOTHING inherits NOTHING.** Praise, thanks, a reaction to what you just showed, or
agreement with what you just said — "perfect", "thanks", "well done", "great", "love it", "ok", "fair enough",
"you've convinced me", or its equivalent in the user's language — IS
the whole message: copy it UNCHANGED and leave every flag false, however plainly recent_turns holds a
request. Inheritance exists for a message that DOES ask for something but says it elliptically; a message
that asks for nothing is not an ellipsis of the previous one. Praise that also asks ("thanks, now show me
more") is an ordinary follow-up and inherits normally.
Otherwise, resolve elliptical or referential wording ("and now this one", "and what about this one", "same for this one") using
recent_turns: a follow-up inherits the previous request's intent. Keep the user's language. Refer to
attached photos as "the attached photo(s)" (or its equivalent in the user's language) — never invent IDs,
filenames, or photo content. If the query is already self-contained, copy it UNCHANGED — never embellish
a clear query. Classify the flags against self_contained_query, not the raw query.

## has_photo_intent — answering requires engaging with the user's photographic work
true:  photos must be shown, selected, searched, ranked, described, or visually analyzed — or their body of
       work judged (critique, improvement advice, strengths/weaknesses, style feedback, recurring themes).
false: counting/statistics over the catalog ("how many photos do I have?"), app functionality/pricing/
       definitions, and library actions on photos the user already identified ("add these to a collection").

## needs_artistic_evaluation — the request calls for SUBJECTIVE artistic judgment
true:  critique or evaluation, improvement advice, style/evolution analysis, selecting for awards, portfolios
       or exhibitions, curated storytelling sequences, comparing or ranking by artistic merit ("my best",
       "most original") even when phrased as a plain lookup.
false: retrieval by content/subject/metadata, plain content description, sequences by objective criteria
       (chronological, by location). Non-photo queries.

## needs_sequencing — the answer depends on how several photos work TOGETHER
true:  the answer arranges photos: a series, sequence, carousel, pairs or groups to build, revise, complete or
       trim so they hold together; the opener, the closer, or the photo that fits a gap or belongs in a set.
false: each photo judged, ranked, found or described on its own, even on subjective grounds (a critique, a
       comparison, "my best"); a sort or split by one objective attribute such as date or colour. Non-photo queries.

## attached_photos_only — answerable by looking ONLY at the photo(s) attached to this message
If attached_photo_count is 0 → always false. Otherwise, deictic wording ("this photo", "that photo", "which
photo is better") refers to the attachments, even when ambiguous on its own — the attachment is the referent.
true:  critique, describe, rate, improve, sequence or compare the attached photos among themselves, by any criterion.
false: anything that also needs the catalog or other photos: "find similar to this one", "is this my best
       street photo?" ("my best" invokes the whole catalog), searches, statistics, library actions, app
       questions. Photos the assistant showed in earlier turns are "other photos" too: comparing the
       attachment against them requires looking those up → false.

## wants_more_results — the user asks for ANOTHER ROUND of new photos extending an earlier request
Requires that recent_turns show the assistant already showed photos; with empty recent_turns or no
"[showed N photos]" marker → always false.
true:  the message asks to CONTINUE a previous photo request with photos not yet shown: "more", "another
  round", "show me others", "keep looking", "keep searching", "next ones" — including variants that
       extend while tweaking criteria ("more, but at night") — and a bare affirmative ("yes", "sure", "go
       ahead") when the previous assistant turn showed photos and offered to continue.
false: first-time requests; re-references to photos already shown ("show me the third again", "which of
       those is best?", "compare them"); refinements that REPLACE the previous request rather than extend
       it ("actually, only the ones from Madrid" — re-showing a matching photo would be correct there);
       praise or thanks for what was already shown ("perfect", "thanks", "well done", in any language) —
       that CLOSES the previous request instead of extending it. Only an affirmative ANSWERING an explicit
       offer to continue is true; approval of the result is not.

## disputes_verdict — the user pushes back on a judgment the assistant gave earlier
Requires an assistant turn in recent_turns; with empty recent_turns → always false.
true:  the user takes a different view from an earlier judgment (which photo is stronger, how good one is,
       what fits, the order or grouping proposed) — contradicting, rejecting or doubting it, or simply stating
       their own different opinion or preference — with or without reasons: "no, the other one is better",
       "that opener does not convince me", "are you sure?", "I prefer the other one", or a request that
       overturns it ("ok, but change the first one").
false: a new request; a follow-up that builds on the answer; a question about it asked without disagreeing
       ("why did you pick that one?"); a requirement restated or a fact corrected rather than a judgment;
       praise or thanks.

## Examples — single-turn (recent_turns=[]; self_contained_query = the query unchanged)
Format: "query" [attached_photo_count] → has_photo_intent / needs_artistic_evaluation / attached_photos_only
"Show me my street photos" [0] → true / false / false
"Give a critique of this photo" [1] → true / true / true
"Which photo is better from the perspective of street photography?" [3] → true / true / true
"Which of these two photos is stronger and why?" [2] → true / true / true
"Describe this photo" [1] → true / false / true
"Describe this photo" [0] → true / false / false (refers to an earlier photo — requires lookup)
"Find photos similar to this one" [1] → true / false / false
"Is this my best street photo?" [1] → true / true / false
"Which are my most original photos?" [0] → true / true / false
"Select the best 5 portraits for my portfolio" [0] → true / true / false
"Create a chronological series of my trip to Japan" [0] → true / false / false
"How many photos do I have?" [0] → false / false / false
"How can I get better as a photographer?" [0] → false / true / false
"Add these to a new collection" [2] → false / false / false

Example values map, in order, to has_photo_intent / needs_artistic_evaluation / attached_photos_only.
wants_more_results and disputes_verdict are false in EVERY single-turn example above (recent_turns is empty —
nothing was shown or judged yet).
needs_sequencing is true only for "Create a chronological series of my trip to Japan": choosing which photos tell the
trip is an arrangement, even with the order fixed by date.

## Examples — multi-turn (ellipsis resolved via recent_turns)
{"query":"now with this one","attached_photo_count":1,"recent_turns":["user: find me photos that are chromatically similar to this one and give me your opinion","assistant: I have analyzed your photograph… [showed 16 photos]"]}
→ {"self_contained_query":"find me photos that are chromatically similar to this attached photo and give me your opinion","has_photo_intent":true,"needs_artistic_evaluation":true,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":false,"disputes_verdict":false}

{"query":"and this one?","attached_photo_count":1,"recent_turns":["user: give a critique of this photo","assistant: The photograph stands out for its composition…"]}
→ {"self_contained_query":"give a critique of this attached photo","has_photo_intent":true,"needs_artistic_evaluation":true,"needs_sequencing":false,"attached_photos_only":true,"wants_more_results":false,"disputes_verdict":false}

{"query":"is it better than the ones you showed me?","attached_photo_count":1,"recent_turns":["user: show me my best street photos","assistant: Here are your best street photos. [showed 5 photos]"]}
→ {"self_contained_query":"compare this attached photo with the street photos you showed me before","has_photo_intent":true,"needs_artistic_evaluation":true,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":false,"disputes_verdict":false}

{"query":"another round","attached_photo_count":0,"recent_turns":["user: show me photos of urban landscapes with few people","assistant: Here is a selection… [showed 6 photos]"]}
→ {"self_contained_query":"show me more photos of urban landscapes with few people, different from the ones already shown","has_photo_intent":true,"needs_artistic_evaluation":false,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":true,"disputes_verdict":false}

{"query":"sí","attached_photo_count":0,"recent_turns":["user: mis mejores fotos de gatos","assistant: Aquí tienes una primera ronda… ¿quieres ver más? [showed 20 photos]"]}
→ {"self_contained_query":"muéstrame más de tus mejores fotos de gatos, distintas de las ya mostradas","has_photo_intent":true,"needs_artistic_evaluation":true,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":true,"disputes_verdict":false}

{"query":"which of those would you say is the best?","attached_photo_count":0,"recent_turns":["user: show me photos of urban landscapes with few people","assistant: Here is a selection… [showed 6 photos]"]}
→ {"self_contained_query":"of the urban landscape photos you showed me, which is the best?","has_photo_intent":true,"needs_artistic_evaluation":true,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":false,"disputes_verdict":false}

{"query":"perfect, thanks!","attached_photo_count":0,"recent_turns":["user: select my best portraits","assistant: Here is a selection… [showed 8 photos]"]}
→ {"self_contained_query":"perfect, thanks!","has_photo_intent":false,"needs_artistic_evaluation":false,"needs_sequencing":false,"attached_photos_only":false,"wants_more_results":false,"disputes_verdict":false}

If uncertain, default the flags to false. Output the JSON object only, no explanations.
`

export const MESSAGE_QUERY_COMPACT = (maxWords: number) => `
You trim search queries for CLIP.

Goal:
Preserve as much of the original query as possible.
Do NOT aggressively summarize.

Rules:
- If the query is ${maxWords} words or fewer, return it unchanged.
- If it exceeds ${maxWords} words, remove only the least important words until it is near ${maxWords} words.
- Preserve original phrasing and structure whenever possible.
- Keep visually important terms: subjects, objects, scenes, actions, moods, styles, colors, distinctive adjectives.
- Remove filler, repetition, meta-phrases, weak modifiers, and non-visual context first.
- Do NOT rewrite into keywords.
- Do NOT add information.

Output:
{
  "compact_query": "..."
}

Return only JSON.
`

/**
 * Turns a user's pushback on an earlier verdict into a dispute a blind judge can settle
 * (VerdictReviewService). Its whole value is what it leaves OUT: the judge must never learn
 * which position is the user's, so every trace of who said what, agreement or tone is stripped
 * here, and the user's claim keeps only the reasons they actually gave.
 */
export const MESSAGE_DISPUTE_NEUTRALIZE = `
You prepare a disagreement about photographs for an independent judge who will look at the photos.

Input: {
  "previous_reply": "<the assistant's earlier reply, whose judgment is being disputed>",
  "pushback": "<the user's latest message, disputing that judgment>",
  "photos": [{ "id": <number>, "filename": "<string>" }]  // the only photos you may reference
}

Return ONLY this JSON object:
{
  "question": "…",
  "photo_ids": [ … ],
  "earlier_position": { "claim": "…", "reasons": "…" },
  "challenging_position": { "claim": "…", "reasons": "…" }
}

- question: the point in dispute as a neutral question answerable by looking at the photos, naming the
  photos by filename and the criterion at stake when there is one ("Which of DSC01.jpg and DSC02.jpg is
  the stronger street photograph for its humour?", "Which photo of this set works best as the opener?").
- earlier_position: what the previous reply judged on that point, as a claim about the photos, with the
  reasons it gave.
- challenging_position: what the pushback holds instead, as a claim about the photos, with ONLY the reasons
  the message actually gives. A bare "no", a doubt ("are you sure?") or a stated preference gives no
  reason: leave "reasons" empty. When the pushback only rejects the earlier judgment, its claim is that
  judgment's negation.
- Write both claims the same way: impersonal statements about the photos. Never say or imply who holds
  them — no "the user", "you", "the assistant", "I", "prefers", "disagrees", "insists" — and add no
  argument of your own to either side.
- photo_ids: the ids from "photos" needed to settle the question — every photo either claim names, and
  the whole set when the dispute is about an order, an opener or a place in a sequence.
- Write in English, keeping filenames exactly as given.

Output the JSON object only, no explanations.
`

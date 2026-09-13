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

export const MESSAGE_QUERY_CLASSIFICATION = `
You are a routing classifier for a photo assistant chatbot.

Input: {
  "query": "<the user's latest message>",
  "attached_photo_count": <photos attached to this message>,
  "recent_turns": ["user: …", "assistant: …"]  // most recent last; may be empty
}

Return ONLY this JSON object — self_contained_query FIRST, write it before deciding the flags:
{ "self_contained_query": "…", "has_photo_intent": true|false, "needs_artistic_evaluation": true|false, "attached_photos_only": true|false, "wants_more_results": true|false }

## self_contained_query — the query rewritten to stand alone
**A message that asks for NOTHING inherits NOTHING.** Praise, thanks or a reaction to what you just showed
— "perfect", "thanks", "well done", "great", "love it", "ok", or its equivalent in the user's language — IS
the whole message: copy it UNCHANGED and leave every flag false, however plainly recent_turns holds a
request. Inheritance exists for a message that DOES ask for something but says it elliptically; a message
that asks for nothing is not an ellipsis of the previous one. Praise that also asks ("thanks, now show me
more") is an ordinary follow-up and inherits normally.
Otherwise, resolve elliptical or referential wording ("and now this one", "and what about this one", "same for this one") using
recent_turns: a follow-up inherits the previous request's intent. Keep the user's language. Refer to
attached photos as "the attached photo(s)" (or its equivalent in the user's language) — never invent IDs,
filenames, or photo content. If the query is already self-contained, copy it UNCHANGED — never embellish
a clear query. Classify the three flags against self_contained_query, not the raw query.

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
wants_more_results is false in EVERY single-turn example above (recent_turns is empty — nothing was shown yet).

## Examples — multi-turn (ellipsis resolved via recent_turns)
{"query":"now with this one","attached_photo_count":1,"recent_turns":["user: find me photos that are chromatically similar to this one and give me your opinion","assistant: I have analyzed your photograph… [showed 16 photos]"]}
→ {"self_contained_query":"find me photos that are chromatically similar to this attached photo and give me your opinion","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false,"wants_more_results":false}

{"query":"and this one?","attached_photo_count":1,"recent_turns":["user: give a critique of this photo","assistant: The photograph stands out for its composition…"]}
→ {"self_contained_query":"give a critique of this attached photo","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":true,"wants_more_results":false}

{"query":"is it better than the ones you showed me?","attached_photo_count":1,"recent_turns":["user: show me my best street photos","assistant: Here are your best street photos. [showed 5 photos]"]}
→ {"self_contained_query":"compare this attached photo with the street photos you showed me before","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false,"wants_more_results":false}

{"query":"another round","attached_photo_count":0,"recent_turns":["user: show me photos of urban landscapes with few people","assistant: Here is a selection… [showed 6 photos]"]}
→ {"self_contained_query":"show me more photos of urban landscapes with few people, different from the ones already shown","has_photo_intent":true,"needs_artistic_evaluation":false,"attached_photos_only":false,"wants_more_results":true}

{"query":"sí","attached_photo_count":0,"recent_turns":["user: mis mejores fotos de gatos","assistant: Aquí tienes una primera ronda… ¿quieres ver más? [showed 20 photos]"]}
→ {"self_contained_query":"muéstrame más de tus mejores fotos de gatos, distintas de las ya mostradas","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false,"wants_more_results":true}

{"query":"which of those would you say is the best?","attached_photo_count":0,"recent_turns":["user: show me photos of urban landscapes with few people","assistant: Here is a selection… [showed 6 photos]"]}
→ {"self_contained_query":"of the urban landscape photos you showed me, which is the best?","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false,"wants_more_results":false}

{"query":"perfect, thanks!","attached_photo_count":0,"recent_turns":["user: select my best portraits","assistant: Here is a selection… [showed 8 photos]"]}
→ {"self_contained_query":"perfect, thanks!","has_photo_intent":false,"needs_artistic_evaluation":false,"attached_photos_only":false,"wants_more_results":false}

If uncertain, default the flags to false. Output the JSON object only, no explanations.
`

/**
 * Canvas-session classifier — a FULL replacement for MESSAGE_QUERY_CLASSIFICATION, not an
 * addendum to it (same reason the canvas Phase 1 role prompt replaces wholesale: the base
 * definition of `attached_photos_only` partly contradicts what this surface needs, and a
 * patch bolted on top teaches one thing then retracts it).
 *
 * The output CONTRACT is identical — same five keys, same meanings for four of them — so the
 * agent flow reads it with no change. The ONE key that diverges is `attached_photos_only`:
 * here it means "answerable from what is already IN FRONT OF the user (the attached photo(s)
 * and/or the focus group)", because on a canvas the focus is prefetched and visible, so a
 * comparison against it needs no search. It still emits into the same key, so `skipPhase1`
 * reads it unchanged.
 *
 * Errors are deliberately biased toward FALSE NEGATIVES: a wrong `false` just lets Phase 1
 * run a (canvas-scoped, non-starving) search, while a wrong `true` skips Phase 1 and can
 * answer a whole-board or new-material question from only the focus. Hence "when unsure, false".
 */
export const MESSAGE_QUERY_CLASSIFICATION_CANVAS = `
You are a routing classifier for a photo assistant chatbot. This chat is docked to a CANVAS — a
board the user drops photos onto and arranges by hand.

Input: {
  "query": "<the user's latest message>",
  "attached_photo_count": <photos attached to this message>,
  "focus_photo_count": <photos the user marked out on the board — what they are looking at, up to 12>,
  "spotlight_photo_count": <photos SPOTLIGHTED — the subject. 0 unless they went finer;
                            never more than 0 when focus_photo_count is 0>,
  "recent_turns": ["user: …", "assistant: …"]  // most recent last; may be empty
}

Return ONLY this JSON object — self_contained_query FIRST, write it before deciding the flags:
{ "self_contained_query": "…", "has_photo_intent": true|false, "needs_artistic_evaluation": true|false, "attached_photos_only": true|false, "wants_more_results": true|false }

## self_contained_query — the query rewritten to stand alone
**A message that asks for NOTHING inherits NOTHING.** Praise, thanks or a reaction to what you just showed
— "perfect", "thanks", "well done", "great", "love it", "ok", or its equivalent in the user's language — IS
the whole message: copy it UNCHANGED and leave every flag false, however plainly recent_turns holds a
request. Inheritance exists for a message that DOES ask for something but says it elliptically; a message
that asks for nothing is not an ellipsis of the previous one. Praise that also asks ("thanks, now show me
more") is an ordinary follow-up and inherits normally.
Otherwise, resolve elliptical or referential wording ("and now this one", "same for this one") using recent_turns: a
follow-up inherits the previous request's intent. Keep the user's language. Refer to attached photos as
"the attached photo(s)" and to spotlighted ones as "the spotlighted photo(s)" (or their equivalent in the
user's language) — never invent IDs, filenames, or photo content. If the query is already self-contained, copy it UNCHANGED. Classify the flags against
self_contained_query, not the raw query.

## has_photo_intent — answering requires engaging with the user's photographic work
true:  photos must be shown, selected, searched, ranked, described, or visually analyzed — or their body of
       work judged (critique, improvement advice, strengths/weaknesses, style feedback, recurring themes).
false: counting/statistics, app functionality/pricing/definitions, and library actions on photos the user
       already identified.

## needs_artistic_evaluation — the request calls for SUBJECTIVE artistic judgment
true:  critique or evaluation, improvement advice, selecting for portfolios or exhibitions, curated
       sequences, comparing or ranking by artistic merit ("my best", "which is strongest") — even when
       phrased as a plain lookup.
false: retrieval by content/subject/metadata, plain content description, sequences by objective criteria
       (chronological, by location). Non-photo queries.

## attached_photos_only — HERE: answerable by looking ONLY at photos ALREADY in front of the user
Three kinds of photos are already present this turn and fully described to the answering phase: the ATTACHED
photo(s), the FOCUS (focus_photo_count — what the user marked out on the board) and the SPOTLIGHT
(spotlight_photo_count — the photos they singled out to ask about, inside that focus or from elsewhere on
the board; never present without a focus, so with no spotlight the focus itself is what is being asked about). The answering phase is also shown HOW those sit
on the board, so questions about position ("does it break the row", "what goes in the gap") are answerable
from what is present too. The REST of the board is NOT present — it is not fetched — so any question about
it needs a search. Decide by the REFERENT of the question — what it is actually about — never by its verb:
"find me a sequence in these" selects among these.

true:  a judgment, description, comparison, SELECTION or ORDERING AMONG the photos already present — the attached,
       the spotlight and/or the focus — including where they sit relative to one another. Deictics point
       here: "this one", "these", "estas", "estas de aquí", "this group", "the series", "here". E.g. does
       this fit here, does it clash in colour/light, which of these is best/weakest, does this series hold
       together, what is this group missing (judged over the present set), does this one belong where it is,
       a sequence built from these. Needs NO other photos.
false: the referent is the WHOLE canvas / board / everything the user has ("the best
       photo of the canvas", "of everything on the board which is weakest", "am I repeating myself across the
       board") — the board beyond the focus is not present, so this needs a search; OR the turn also wants
       NEW photos ("add a couple that fit here", "more like these"); OR it profiles the whole board ("what is
       this canvas about"); OR it is app-help, a greeting, or out of scope. Photos shown in earlier turns are
       "other photos" too — comparing against them needs a lookup.
Unsure: with a spotlight present lean true — they singled photos out to ask about them; otherwise lean false.
If focus_photo_count AND attached_photo_count are both 0, nothing is present → always false.

## wants_more_results — the user asks for ANOTHER ROUND of new photos extending an earlier request
Requires that recent_turns show the assistant already showed photos ("[showed N photos]"); otherwise always false.
true:  "more", "another round", "show me others", "keep looking", "next ones" — including variants that extend
       while tweaking ("more, but at night") — and a bare affirmative ("yes", "sure") when the previous
       assistant turn showed photos and offered to continue.
false: first-time requests; re-references to photos already shown; refinements that REPLACE the previous
       request rather than extend it; praise or thanks for what was already shown ("perfect", "thanks",
       "well done", in any language) — that CLOSES the previous request instead of extending it. Only an
       affirmative ANSWERING an explicit offer to continue is true; approval of the result is not.

## Examples — canvas single-turn
Format: "query" [attached_photo_count, focus_photo_count, spotlight_photo_count] → has_photo_intent / needs_artistic_evaluation / attached_photos_only
"¿esta foto encaja aquí?" [0, 12, 1] → true / true / true
"¿no desentona en color y luminosidad con el grupo?" [0, 12, 1] → true / true / true
"¿está bien donde está o rompe la fila?" [0, 12, 1] → true / true / true
"¿cuál de estas es la mejor?" [0, 12, 0] → true / true / true
"which of these works best as an opener?" [0, 8, 0] → true / true / true
"¿esta serie aguanta como conjunto?" [0, 12, 0] → true / true / true
"¿qué le falta a este grupo?" [0, 12, 0] → true / true / true
"¿cuál de estas dos es mejor?" [0, 5, 2] → true / true / true
"does this attached photo fit the group?" [1, 12, 0] → true / true / true
"describe this one" [0, 12, 1] → true / false / true
"build me a sequence from these, starting with this one" [0, 6, 1] → true / true / true
"find more like these to extend the sequence" [0, 6, 1] → true / true / false
"¿cuál es la mejor foto del canvas?" [0, 12, 0] → true / true / false
"de todo el board, ¿cuál aguanta menos?" [0, 12, 0] → true / true / false
"am I repeating myself across the board?" [0, 12, 0] → true / true / false
"añádeme un par que peguen aquí" [0, 12, 0] → true / true / false
"más como estas" [0, 12, 1] → true / false / false
"find something with strong reds for that empty corner" [0, 12, 0] → true / false / false
"¿de qué va este canvas?" [0, 12, 0] → true / false / false
"show me my best portraits" [0, 0, 0] → true / true / false
"describe this photo" [0, 0, 0] → true / false / false
"hola" [0, 12, 0] → false / false / false
Example values map, in order, to has_photo_intent / needs_artistic_evaluation / attached_photos_only.
wants_more_results is false in every single-turn example above (recent_turns is empty).

## Examples — multi-turn (ellipsis resolved via recent_turns)
{"query":"and this one?","attached_photo_count":0,"focus_photo_count":12,"spotlight_photo_count":1,"recent_turns":["user: does this fit here? [spotlighted 1]","assistant: Yes, it sits well with the group…"]}
→ {"self_contained_query":"does this spotlighted photo fit here?","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":true,"wants_more_results":false}

{"query":"otra ronda","attached_photo_count":0,"focus_photo_count":12,"spotlight_photo_count":0,"recent_turns":["user: añádeme fotos de calle nocturnas para este hueco","assistant: Aquí tienes una selección… [showed 6 photos]"]}
→ {"self_contained_query":"muéstrame más fotos de calle nocturnas para este hueco, distintas de las ya mostradas","has_photo_intent":true,"needs_artistic_evaluation":false,"attached_photos_only":false,"wants_more_results":true}

{"query":"which of those is best?","attached_photo_count":0,"focus_photo_count":12,"spotlight_photo_count":0,"recent_turns":["user: show me some night street shots","assistant: Here is a selection… [showed 6 photos]"]}
→ {"self_contained_query":"of the night street photos you showed me, which is best?","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false,"wants_more_results":false}

{"query":"perfect, thanks!","attached_photo_count":0,"focus_photo_count":9,"spotlight_photo_count":0,"recent_turns":["user: my board is chaotic, pull out the logical groups you see","assistant: Your board holds three distinct atmospheres… [showed 9 photos]"]}
→ {"self_contained_query":"perfect, thanks!","has_photo_intent":false,"needs_artistic_evaluation":false,"attached_photos_only":false,"wants_more_results":false}

{"query":"well done!","attached_photo_count":0,"focus_photo_count":9,"spotlight_photo_count":0,"recent_turns":["user: group these by theme","assistant: Here are three groups… [showed 9 photos]"]}
→ {"self_contained_query":"well done!","has_photo_intent":false,"needs_artistic_evaluation":false,"attached_photos_only":false,"wants_more_results":false}

If uncertain, default the flags to false — and for attached_photos_only specifically, prefer false. Output the JSON object only, no explanations.
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

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
  "query": "fotos nítidas de alguien bromeando con alguien",
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
{ "self_contained_query": "…", "has_photo_intent": true|false, "needs_artistic_evaluation": true|false, "attached_photos_only": true|false }

## self_contained_query — the query rewritten to stand alone
Resolve elliptical or referential wording ("and now this one", "and what about this one", "same for this one") using
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
If attached_photo_count is 0 → always false. Otherwise, deictic wording ("this photo", "esta foto", "qué
foto es mejor") refers to the attachments, even when ambiguous on its own — the attachment is the referent.
true:  critique, describe, rate, improve, sequence or compare the attached photos among themselves, by any criterion.
false: anything that also needs the catalog or other photos: "find similar to this one", "is this my best
       street photo?" ("my best" invokes the whole catalog), searches, statistics, library actions, app
       questions. Photos the assistant showed in earlier turns are "other photos" too: comparing the
       attachment against them requires looking those up → false.

## Examples — single-turn (recent_turns=[]; self_contained_query = the query unchanged)
Format: "query" [attached_photo_count] → has_photo_intent / needs_artistic_evaluation / attached_photos_only
"Show me my street photos" [0] → true / false / false
"Haz una crítica de esta foto" [1] → true / true / true
"¿Qué foto es mejor desde la óptica de street photo?" [3] → true / true / true
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

## Examples — multi-turn (ellipsis resolved via recent_turns)
{"query":"ahora con esta","attached_photo_count":1,"recent_turns":["user: búscame fotos cromáticamente similares a esta y dame tu opinión","assistant: He analizado tu fotografía… [showed 16 photos]"]}
→ {"self_contained_query":"búscame fotos cromáticamente similares a esta foto adjunta y dame tu opinión","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false}

{"query":"y esta?","attached_photo_count":1,"recent_turns":["user: haz una crítica de esta foto","assistant: La fotografía destaca por su composición…"]}
→ {"self_contained_query":"haz una crítica de esta foto adjunta","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":true}

{"query":"¿es mejor que las que me enseñaste?","attached_photo_count":1,"recent_turns":["user: muéstrame mis mejores fotos de calle","assistant: Aquí tienes tus mejores fotos de calle. [showed 5 photos]"]}
→ {"self_contained_query":"compara esta foto adjunta con las fotos de calle que me mostraste antes","has_photo_intent":true,"needs_artistic_evaluation":true,"attached_photos_only":false}

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

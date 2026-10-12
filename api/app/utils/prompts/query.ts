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
- Resolving a reference replaces only the words that refer ("this one", "that photo", "the change") with what
  they point to. A message that states a request of its own keeps it, with its references resolved — never
  swap it for an earlier request. Only a message that asks nothing new of its own ("and this one?", a bare
  "yes") takes the previous request over whole.
- When the request leaves the user's photos implicit — anything to be shown, found, chosen or arranged is
  made of their photos in this app — the rewrite names them (e.g. "and now at night" after "a series
  from Lisbon" → "a series of my photos from Lisbon at night").
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
       This is a photo app, so photos are usually implicit: a subject, place, theme or route asked for
       ("and now dogs", "a route through a country") means the user's photos of it.
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
Requires an assistant turn in recent_turns; with empty recent_turns → always false. Judge the raw query against
the latest assistant turn, never self_contained_query: pushback belongs to this message and is not inherited
from an earlier user turn.
true:  ONLY an explicit contrary judgment of the photos, saying an earlier assessment (which one is stronger,
       how good one is, what fits) is wrong: "no, the other one is better", "that opener does not convince me",
       "I think this one is stronger", "I disagree, the second works better" — with no reasons given, and
       phrased as a preference too. Rejecting the photos themselves asks for other photos, not for a
       different assessment.
false: anything less explicit: a doubt or a question ("are you sure?", "why that one?", "is it better than the
       others?"); a request to change something without saying the assessment is wrong ("ok, but change the
       first one"); what the user wants instead — a new direction, approach, criterion, source or scope — even
       when it opens with "no" or is phrased as a preference; a clarification; a requirement restated or a
       fact corrected; agreement, praise or thanks.

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
  "settleable": true|false,
  "question": "…",
  "photo_ids": [ … ],
  "earlier_position": { "claim": "…", "reasons": "…" },
  "challenging_position": { "claim": "…", "reasons": "…" }
}

- settleable: true only when both hold:
  1. previous_reply judged the quality or fit of the photos — which one is stronger, how good one is,
     what fits where. Presenting photos, or saying what they show (subject, place, date), is not a judgment.
  2. The pushback contradicts or doubts that same judgment — holds the contrary view, prefers another
     photo, or doubts what was said ("are you sure?", "I still don't see it") — and the listed photos alone
     can settle it. A pushback that rejects the photos themselves asks for other photos, one that corrects
     what they show corrects a fact, and one that asks a new question about the photos or to redo the work
     by another criterion or approach asks for a new answer: none of them disputes the judgment.
  When false, leave every other field empty.
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

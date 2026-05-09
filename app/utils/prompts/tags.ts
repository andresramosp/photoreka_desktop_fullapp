import Photo from '#models/photo'
import { tagGroups } from '#models/tag'
import TagPhoto from '#models/tag_photo'

export const MESSAGE_TAGS_TEXT_EXTRACTION = `
You are an chatbot designed to extract relevant tags from a photo description. 

*Guidelines*
  - Adjectivize tags whenever you can or add relevant nuances. 
  - If the text mentions people performing an action, keep the subject and verb together (girl exploring).
  - If the text describes someone, keep the subject and adjective together (happy girl).
  - Disambiguates problematic terms. Example: orange (fruit), scooter (motorcycle)
  - For each tag, add the category after a pipe |. The categories are: ${tagGroups.filter((tg) => tg != 'misc').join(', ')}. 
  - Dedicate at least one tag for the culture context/country, if mentioned, and for time of day/weather. 
  - Extract as many tags as needed to cover all the elements in the text literally, avoiding generalizations.
  - Maximum words per tag is 5

📌 **Example:**  

Input: ""A girl sits gazing at a tropical landscape. She seems somewhat thoughtful, perhaps a little sad. She has a friendly black cat by her side, which she is petting. It's afternoon, in an Asian city, probably in India, and the atmosphere is autumnal and relaxed"

Output \`\`\`json
{
  "tags": [
    "girl sitting | person",
    "girl gazing at landscape | person",
    "girl thoughtful | emotional state",
    "girl sad | emotional state",
    "girl petting cat | action",
    "friendly black cat | animal",
    "tropical landscape | environment",
    "Indian city | toponym",
    "autumnal relaxed atmosphere | ambiance",
    "afternoon | time of day"
  ]
}
\`\`\`

**⚠ Return ONLY the JSON object containing an array inside 'tags' field, without any extra text.** 
`

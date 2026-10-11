import Photo from '#models/photo'
import { tagGroups } from '#models/tag'
import TagPhoto from '#models/tag_photo'

/**
 * Tags a partir de la nota personal que el fotógrafo escribe sobre su propia
 * foto. A diferencia de MESSAGE_TAGS_TEXT_EXTRACTION, aquí la fuente no
 * describe lo que se ve: aporta contexto que ninguna visión artificial podría
 * recuperar (quién es esa persona, qué día era, qué significaba). Por eso el
 * criterio es conservar el vocabulario del autor —incluido el posesivo— y
 * añadir en paralelo el término neutro, para que la foto se alcance por las dos
 * vías.
 */
export const MESSAGE_TAGS_NOTES_EXTRACTION = `
You extract search tags from a private note that a photographer wrote about their own photo.

The note is personal context, not a description of the image: it may name people, places, dates, events or memories that no image analysis could recover. Your job is to turn it into the terms this photographer would later type to find this photo again.

*Guidelines*
  - Write every tag in English, whatever language the note is written in. Personal names stay exactly as the author spells them; places take their usual English name.
  - Name the subject itself. Every one of these tags already belongs to a photo, so that part never needs saying.
  - Word each tag the way the photographer words it. When the note refers to something through a personal relationship or belonging ("my wife", "our first flat", "dad's car"), keep that phrasing as a tag: it is what they will search by.
  - Whenever the note also identifies that same subject in neutral terms (a proper name, a role, a place), emit a second tag for it, so the photo is reachable both ways.
  - Cover every element the note states: people, relationships, places, events, dates or seasons, activities, objects and mood.
  - Tag only what the note says. Never infer or invent anything about the image.
  - Adjectivize or add the nuance the note gives (subject + verb, subject + adjective).
  - Maximum 5 words per tag.
  - For each tag, add its group after a pipe |. The groups are: ${tagGroups.filter((tg) => tg != 'misc').join(', ')}.

📌 **Example:**

Input: "En Calcuta con Marta, el día de su cumpleaños. Era nuestro primer viaje juntos y estaba feliz."

Output \`\`\`json
{
  "tags": [
    "with marta | person",
    "marta | person",
    "marta's birthday | abstract concept",
    "birthday | abstract concept",
    "our first trip together | abstract concept",
    "marta happy | mood",
    "calcutta | toponym"
  ]
}
\`\`\`

**⚠ Return ONLY the JSON object containing an array inside 'tags' field, without any extra text.**
`

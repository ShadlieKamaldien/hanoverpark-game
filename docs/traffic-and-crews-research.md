# Traffic and fictional rival crews in Hanover Park

Research date: **14 October 2026** (Africa/Johannesburg).

The user requested cars driving along the mapped streets and neighbourhood-specific crews with **rival reactions and pursuits**. This update extends the earlier dialogue-only NPC pass. The setting uses researched Hanover Park geography and community context; crew identities, colours, members, affiliations, reactions and hangout positions are original game fiction.

## Public sources and their limits

| Source consulted | Evidence used | Limit |
| --- | --- | --- |
| City of Cape Town, **Hanover Park Public Investment Framework**, draft dated 22 October 2015: https://www.capetown.gov.za/media/fd3puiln/hanover-park-public-investment-framework_22-october-2015.pdf | Printed **page 10** describes establishment in 1969, Group Areas Act relocations from District Six, Claremont and Newlands into council rental accommodation, initially two-storey residential blocks and later three-storey blocks. It also describes the community's history of local activism and cultural vitality. Printed page 58 names Downberg Road. | Historical planning evidence. Its contemporary-to-2015 conditions, crime maps, territorial analysis, statistics and proposals are not a survey of the neighbourhood in 2026. Planned improvements do not establish completed works. |
| GroundUp, **“Hanover Park residents threaten gangsters outside their homes”**, 13 October 2025: https://groundup.org.za/article/hanover-park-residents-protest-outside-gangsters-houses-demanding-an-end-to-violence/ | Reporting documents residents demanding an end to gang violence and harm to children. It establishes the seriousness of the local context, rather than presenting gang activity as the whole identity of the neighbourhood. | A reported event, including allegations. It does not establish every person's affiliation, current exact territories or a map for gameplay encounters. No resident, alleged offender, real gang identity, protest chant, photograph or incident is copied into the game. |
| GroundUp, **“Has the army deployment in Cape Town made communities safer?”**, 21 July 2026: https://groundup.org.za/article/has-the-army-deployment-in-cape-town-made-communities-feel-safer/ | Describes local community support for mothers affected by violence and reports factional splits as a driver of unrest. It also discusses neighbourhood watches, community structures and policing. | Contextual reporting. Neither its crime statistics nor the identity or experiences of a real person become NPC attributes. The article does not supply verified present-day crew boundaries or pursuit behaviour. |
| GroundUp, **“Covid-19: exercise helps with the cigarette ban, says Hanover Park jogger”**, 6 August 2020: https://groundup.org.za/article/hanover-parks-joggers/ | Describes people of different ages running and walking together, and residents challenging crime-only portrayals of Hanover Park. | Historical community reporting. The game does not reproduce a real club roster or certify a current running schedule. |
| The successfully retrieved OpenStreetMap snapshot and municipal directory evidence recorded in [the map research](real-map-research.md) | Supplies actual mapped Downberg Road, **Lansry Walk**, other road centrelines, court footprints and facilities. Both named roads are tagged `residential` in the imported data. This is the geographic source for road-following vehicles and safe placement. | The imported geometry does not establish current legal vehicle restrictions, traffic counts, exact lane markings, crew territories or criminal activity at any court, road or shop. Despite its name, Lansry Walk is not asserted to be a pedestrian-only footpath. |
| Wikipedia, **“Left- and right-hand traffic”**: https://en.wikipedia.org/wiki/Left-_and_right-hand_traffic | Its country table lists **South Africa as left-hand traffic**. This supports choosing left-side traffic for the simulation. | Secondary, community-edited evidence. This is not a consulted statutory text or a route-specific traffic survey. Its linked commercial driving references were not needed as separate evidence. |

The GroundUp pages and Wikipedia traffic page were successfully retrieved as public HTTPS pages during this pass. A previously retrieved copy of the primary municipal PDF was read alongside the existing map research; its source remains the City's URL above. No third-party image, voice recording, song, gang insignia, quotation or published story is imported as a game asset.

The candidate official National Road Traffic Act page at `https://www.gov.za/documents/national-road-traffic-act` and the South African Tourism candidate at `https://www.southafrica.net/gl/en/travel/article/getting-around` returned **environment-proxy HTTP 403**. Their page text was not consulted and is not claimed as evidence. South African History Online's readable Hanover Park summary was also checked, but its population statements were internally unclear; those figures are not used. The municipal historical source above is the preferred source for the built-setting history.

## Specificity without invented real affiliations

Use the mapped court forms, Downberg street geometry, Cape Town left-side driving, original Kaaps-influenced dialogue, corner conversation, foot traffic and ordinary neighbours to establish the place. Continue the existing everyday community roles, shops, sport, washing and repairs. Crews occupy only small original encounter spaces in the simulation; the map should not acquire claimed real gang borders or labels for crime at real buildings.

The following are **original fictional crew concepts**, not researched real gang names:

| Fictional crew | Visual suggestion | Fictional hangout suggestion | Original adult members |
| --- | --- | --- | --- |
| **Downberg Side** | Burnt orange shirts or caps, with varied trousers and individual appearance | A clear pavement/side-road corner near the mapped Downberg corridor, selected for gameplay visibility and collision clearance | Ismail **“Izzy”**, Clayton **“Clay”**, André **“Dre”** |
| **Lansry Crew** | Teal shirts or caps, with varied trousers and individual appearance | A different clear roadside/path corner near mapped Lansry Walk, far enough from the first group for readable rival reactions | Daniel **“Danie”**, Marcel **“Marz”**, Yusuf **“Yus”** |

Exact actor spawn positions belong to the game implementation, not the research. A suggested hangout is not evidence that a real gang occupies that street or court. Colours support game readability and are not documented real gang uniforms. Original names can coincidentally resemble names in public; the characters are not those people. Do not add real surnames, photographs, copied aliases, biographies or allegations to these characters.

The naming style follows the previously verified broader Cape Town **shortened-given-name nickname** pattern in [the NPC language research](npc-language-research.md). It does not establish a Hanover Park name-frequency survey or claim that these six people exist locally. All six are fictional adults, with nicknames distributed as an ordinary familiar naming pattern rather than proof of criminal status.

## Original dialogue drafts

These optional lines were written for the new gameplay; they are **not quotations** from a resident, journalist, poem, real gang member or published script. Their final wording and the actual state transitions are maintained in the code. Sparse **awe**, **howzit**, **bru** and **lekker** use the prior language pass's modest secondary evidence. Not every NPC should speak the same way or fill every sentence with slang.

| Situation | Original draft |
| --- | --- |
| Downberg greeting | “Howzit, bru. We're Downberg Side. Mind the cars coming up the road.” |
| Lansry greeting | “Awe. We're Lansry Crew. Don't block the gate — people must get to their flats.” |
| Joining makes the consequence explicit | “You can walk with us if you want — but Lansry Crew will see you as a rival.” |
| Ordinary corner conversation | “They're having a kickabout later. And don't send the ball into Aunty's washing again, hey.” |
| Rival warning gives time to leave | “Hey, bru. You're wearing their colours. Move along before this gets worse.” |
| A pursuit begins | “Wag daar! We told you to move along.” |
| Player creates distance | “Sharp. Give us some space, hey.” |
| De-escalation / leaving affiliation | “Leave the crew and we leave it here.” |

Crew affiliation and its rival consequence should be communicated before the player opts in. Neutral players should be able to pass and converse. A warning grace period, escape distance, a bounded pursuit and a way to leave a crew make the fiction understandable. These are design choices for this game, not claims about how real groups behave or advice for interacting with real people.

The R2 request NPCs remain separate from crew affiliation: asking for money or discussing addiction must not automatically classify an NPC as a crew member or trigger hostility. Skin tone, a nickname or wearing a cap does not determine an encounter role. The six members can share affiliation colours while retaining distinct names, appearances and lines.

## Traffic fidelity

Cars should follow selected real road centrelines with opposing left-side lane offsets and travel in both directions. Vehicle meshes, paint, lights, movement timing and any stopping or separation logic are original simulation. Do not call decorative traffic a complete traffic model, assert measured local flow, invent actual municipal signal timings or present game lanes as legal driving guidance.

Use ordinary small cars and a restrained local street scale rather than placing unrelated motorway traffic inside narrow courts. Keep road movement separate from pedestrian pursuit: traffic is atmosphere unless the implementation explicitly adds a clear vehicle interaction. Source road geometry, decorative additions and gameplay rules should remain distinguishable, with existing OpenStreetMap attribution preserved.

# 3D NPC names, nicknames and language research

Research date: **14 October 2026** (Africa/Johannesburg).

This pass supports fictional adult NPCs for the mapped 3D neighbourhood. The user selected **dialogue only for now**: R2 requests and intimidating stranger conversations do not establish cash transfers, robberies, chases or damage in this update.

## Sources read and what they establish

The pages below were successfully retrieved as public HTTPS pages. They support naming and language choices; they do not identify NPCs or establish drug use/crime at any game location.

| Source | Evidence used | Limit |
| --- | --- | --- |
| GroundUp, **“Rosa choir unites people in song”**, 9 July 2013: https://groundup.org.za/article/rosa-choir-unites-people-song/ | A Cape Town choir with participants from Lentegeur, Manenberg, Langa and elsewhere uses **Boeta + first name**. It explicitly describes a shortened given-name nickname used by fellow choristers. The choir uses Afrikaans, isiXhosa and English. | Evidence of actual Cape Town community usage, not a Hanover Park naming survey. No chorister identity, photograph, biography or dialogue is reproduced in NPCs. |
| GroundUp, **“Open air cinema brings joy to Manenberg’s children”**, 11 November 2025: https://groundup.org.za/article/community-open-air-cinema-is-reclaiming-joy-for-manenberg-youth/ | A community organiser uses **aunty** for a neighbour contributing to an ordinary community activity. | Manenberg is a separate area. This supports a form of address and community activity; it does not place that real event in Hanover Park. |
| GroundUp, **“Heritage Day: poet celebrates Kaaps dictionary”**, 24 September 2026: https://groundup.org.za/article/poet-celebrates-kaaps-dictionary-on-heritage-day/ | Reports the trilingual **Kaaps Woriboek**, released in 2026 and led by UWC linguist Professor Quentin Williams. It explains **ma se kind** as an affectionate address that can encompass brother/sister relationships and discusses the spelling **djy** appearing in the dictionary. | This is reporting on the dictionary and a poet’s explanation, not direct access to every dictionary entry. Do not claim that all proposed dialogue was checked against the Woriboek or reviewed by speakers. |
| South African History Online, **“Adam Small”**, last updated 22 December 2023: https://sahistory.org.za/people/adam-small | Documents Small’s use and defence of Kaaps as meaningful literature and speech, including opposition to its portrayal as deficient. | Cultural context, not a dialogue phrasebook or a contemporary speech survey. Do not borrow his characters, verse or plots. |
| GroundUp, **“Covid-19: exercise helps with the cigarette ban, says Hanover Park jogger”**, 6 August 2020: https://groundup.org.za/article/hanover-parks-joggers/ | Hanover Park residents of different ages took part in walking/running; speakers objected to crime-only portrayals of their neighbourhood. | Historical reporting. The new jogger and her route are original fiction, not an existing club member or verified current activity schedule. |
| GroundUp, **“Cheap tik takes hold in Tshwane townships”**, 28 January 2025: https://groundup.org.za/article/meth-for-as-little-as-r10-a-hit-has-spread-across-northern-tshwanes-townships/ | Explicitly identifies **tik** as a Western Cape name for crystal methamphetamine. | Used only to verify the word. Its places, prices, individual histories and prevalence are not transferred to Hanover Park or to game mechanics. |
| GroundUp, **“Nyanga residents say they are too scared to report crime”**, 15 February 2017: https://groundup.org.za/article/nyanga-residents-too-scared-report-crime/ | Documents **skelms** used for people robbing commuters, corroborating the everyday criminal/crook sense. | Nyanga is a separate area. No resident identity or incident is transferred to the game. |
| Wikipedia, **“List of South African slang words”**: https://en.wikipedia.org/wiki/List_of_South_African_slang_words | Secondary reference for **awe/aweh**, **howzit**, **bru** and **lekker**, with varying uses and spellings. | Community-edited, broad South African scope and uneven sourcing. Use modestly; this is not proof that every Hanover Park speaker uses each word or that all slang is Kaaps. |

Direct access to the Kaaps dictionary site (`https://dwkaaps.co.za/`), the linked UWC article (`https://www.uwc.ac.za/about/alumni/news-events/uwc-is-giving-kaaps-its-place-in-history`), the Dictionary of South African English (`https://dsae.co.za/`) and the cited Words Without Borders introduction returned an environment-proxy HTTP 403. Their page text was **not** consulted. The 2026 dictionary publication is supported by the successfully read GroundUp article; older descriptions saying that the first dictionary had only just been announced in 2021 should not be treated as current publication status.

## Evidence used for naming decisions

The implemented names use ordinary given names, occasional respectful **Aunty/Boeta** address, and a few shortened given-name nicknames. Final dialogue and activities are maintained in `src/preview3d/npcs.ts`; the table below records the original character concepts, not a promise of a particular animation or activity. The researched pattern is broader Cape Town usage; the roster below is **original fiction**, not a list of real Hanover Park people or a claim about name frequency. A first name appearing elsewhere in public does not make the character that real person. Do not add real surnames, employer identities, gang affiliations or copied criminal/addiction biographies.

Nicknames are distributed among ordinary neighbours as well as troubled strangers. A nickname does not signal a criminal role. Titles also vary: not every adult is an aunty, boeta or uncle. The roster has adults of different ages and genders, with different purposes; it is not intended to define the area’s demographic proportions.

| Original character | Suggested age band | Role | Naming rationale |
| --- | --- | --- | --- |
| Aunty Soraya | 50–65 | Neighbour fetching her washing | Respectful familiar title + ordinary given name. |
| Boeta Moosa | 55–70 | Neighbour fixing a gate | Researched Boeta + first-name pattern; independent of the real choir members. |
| Aunty Patricia | 55–70 | Neighbour out for groceries | Another ordinary neighbour; a different English-speaking register. |
| Nazeem “Zeem” | 30–45 | Fictional independent snack seller | Original shortening; not staff or owner of a real mapped business. |
| Ashleigh “Ash” | 20–30 | Adult student | Original shortened given name; everyday study/travel conversation. |
| Wesley “Wes” | 25–40 | Football neighbour | Original shortening; sport rather than a gang or street reputation. |
| Luthando “Lu” | 25–40 | Commuter | Original shortening; broad Cape Town multilingual context, not a claim about Hanover Park name frequency. |
| Carmen | 35–50 | Jogger | Ordinary given name; walking/jogging has verified local context. |
| Shaun “Shaunie” | 30–45 | Adult asking for R2, discussing a struggle with tik | Original familiar diminutive. Addiction is disclosed in fiction, not diagnosed from appearance or linked to theft. |
| Ricardo “Rico” | 30–45 | Separate adult asking for R2 and support | Original shortening. Asking for money does not cause a robbery. |
| Darren “Daz” | 30–45 | Intimidating stranger | Original shortening; separate from R2 request characters. |
| Brendan “Bren” | 25–40 | Intimidating stranger | Original shortening; no real criminal’s alias or gang identity. |

The eight ordinary community roles remain the majority. The two R2 request characters and two intimidating strangers are separate people. Never use a drug request as an automatic trigger for a crime encounter. Display their names and conversational role, rather than labelling a real person or every passer-by “tik kop”. Clothing and skin tone do not determine the role.

## Language choices

Kaaps is a meaningful spoken and written variety with a history and several speaker registers. It should not become a sequence of comedy spellings or a single exaggerated accent. GroundUp’s 2026 article gives a recent spelling reference for **djy**; **ma se kind** is used sparingly as affectionate address. Use ordinary English or Afrikaans for most sentences and occasional familiar expressions, varying by character. Aunty Patricia need not speak like Wes or Shaun.

- **Awe/aweh**: greeting or positive acknowledgement in broad South African slang usage; use “Awe” consistently in original dialogue. It is not exclusive to criminals.
- **Howzit / hoesit**: casual greeting, with spelling variants in the broad slang reference. It is not a literal request for a medical condition update.
- **Bru**: familiar “brother/friend” address. Not every speaker should use it, and it is not reserved for threats.
- **Lekker**: pleasant, good, enjoyable or tasty depending on context.
- **Boeta / Aunty**: familiar or respectful address supported by public community reporting. The sources do not establish that every unrelated adult should receive these titles.
- **Ma se kind**: affectionate address supported by the poet’s explanation in the 2026 dictionary reporting.
- **Djy**: Kaaps spelling discussed in that reporting; maintain it inside the occasional Afrikaans sentence rather than inserting a phonetic spelling into every English line.
- **Tik**: Western Cape term for methamphetamine. It does not imply that a person is violent, dishonest or beyond help.
- **Skelm / skelms**: crook/crooks in the documented robbery context. It is not a nickname for all young men or strangers.

“Hosh” is in the older 2D script but was not verified for this new script. Do not present it as a researched universal Hanover Park greeting. Descriptive nicknames such as “Shorty” or jokes about teeth, appearance or cognitive ability were not needed for this roster.

## Optional original draft lines, not quotations

These are optional writing drafts for the character concepts above. They may differ from the final script in `src/preview3d/npcs.ts`; they are included to make the research-to-fiction choices reviewable. The following lines are newly written fiction. They are not quotations from the linked sources, translations of existing poems, resident-approved dialogue or promises of an exact local accent. Character actions and movements are simulation details. The dialogue-only update should not offer choices labelled “Give R2” or “Pay” if no transfer occurs.

| Character | Opening line | Optional response/follow-up |
| --- | --- | --- |
| Aunty Soraya | “Howzit, ma se kind. The wind’s up again. I must fetch the washing before it ends up downstairs.” | “Hou mooi. And don’t disappear without greeting, hey.” |
| Boeta Moosa | “Howzit, Riyaad. Daai hek is weer los. I’m fixing it before it comes off.” | “As djy my spanner sien, bring hom hier. Thanks, man.” |
| Aunty Patricia | “Morning, my child. I’m off for bread. You’re welcome to walk with me.” | “Take your time. It’s a lovely day to be outside.” |
| Nazeem “Zeem” | “Awe. I’ve got fresh rolls today. I’m Zeem — Nazeem if my mother’s calling.” | “Sharp, come say hello when you pass again.” |
| Ashleigh “Ash” | “Howzit. I’ve got notes to finish before class. Even the wind’s turning my pages.” | “Just call me Ash. Everyone does.” |
| Wesley “Wes” | “Awe, my bru. We’re having a kickabout later. Bring your boots if you come through.” | “Wes is fine. Only my aunt calls me Wesley when I’m late.” |
| Luthando “Lu” | “Morning. I’m heading for a taxi. I left early today; I’m tired of running for it.” | “Lu is fine. Have a good one.” |
| Carmen | “Howzit. I’m doing one more easy lap. Walking counts too, hey.” | “A little bit every day. That’s the plan.” |
| Shaun “Shaunie” | “Awe, Riyaad. Ek sukkel met tik. Het djy miskien ’n R2? Dis reg as djy nie kan nie.” | Player can say “I can’t help with cash” or “I hope you find support”; Shaun responds “Okay. Dankie for stopping. Hou mooi.” |
| Ricardo “Rico” | “Howzit, my bru. Ek’s kort ’n R2. Ek probeer wegkom van tik, maar vandag is swaar.” | Player can say “I can’t help with cash” or “Take care of yourself”; Rico responds “Ja, I hear you. Sharp.” |
| Darren “Daz” | “Hey, wag gou. Haal jou cash uit. Ek praat met jou.” | Player can say “I’m walking away”; Darren replies “Ja, loop dan.” End the dialogue without deductions or pursuit. |
| Brendan “Bren” | “Wag daar. You’ve got money, né? Give it here.” | Player can say “Leave me alone”; Brendan replies “Keep moving, then.” End the dialogue without deductions or pursuit. |

A short conversation can make the purpose clear without rendering these adults as stock comedy figures. These draft lines cover verbal encounters only. If the user later requests gameplay encounters, cash transfers or pursuit should be communicated clearly and the requester/stranger roles should remain separate.

## Fidelity still to improve

Public sources establish a few address and shortening patterns, some lexical meaning and the importance of varied community life. They do not establish a complete current Hanover Park nickname catalogue or a standard accent for every resident. More specific nickname origins, speaker-specific grammar and recorded voice performances would benefit from voluntary local review and consented, licensed recordings. No voice, photo, poem, song or real resident’s criminal/addiction biography is included in this pass.

# Watch-house relationship register

The film must never imply a commercial relationship that did not exist. Before a house's name, logo or product appears, it is classified here. Anything not in this table is **UNCLASSIFIED: no logo, no name in narration**.

Classes: `authorized_retailer`, `collaboration`, `interview_content`, `manufacture_visit`, `event_access`, `media_coverage`, `other_documented`. Never upgrade one class into another.

| House | Class | Evidence (photo, invitation, link, contract) | Wording that is allowed | Logo allowed |
| --- | --- | --- | --- | --- |
| Tudor | `event_access` (provisional) | Photo of an occasion with Tudor and Saddik & Mohamed Attar signage, supplied by Time Keeper | "مناسبة تيودور" (a Tudor occasion we attended) | Only as it appears in the real photograph |
| Rolex | UNCLASSIFIED | | | No |
| Patek Philippe | UNCLASSIFIED | | | No |
| Audemars Piguet | UNCLASSIFIED | | | No |
| Hublot | UNCLASSIFIED | | | No |
| Bulgari | UNCLASSIFIED | | | No |
| Gerald Charles | `authorized_retailer` (provisional) | Time Keeper's own product pages list the brand; a sponsored Time Gallery launch article calls it an authorized-dealer brand (search results, pages not opened) | "نبيع ساعات جيرالد تشارلز" only after Time Keeper confirms authorization | Only with permission |
| Lebois & Co | `collaboration` (provisional) | The brand's own site lists a Heritage Chronograph Time Keeper Edition, 50 pieces (search result) | Name the edition only after Time Keeper confirms what it contributed | Only with permission |
| West End Watch Co | `collaboration` (provisional) | time-keeper.com lists a Bairak Kuwait Limited Edition by West End, 150 pieces (search result) | As above | Only with permission |
| Dubai Watch Week | `event_access` (provisional) | The event's own page lists a TK Collectors Session in 2021 (search result) | "كنا في…" only after confirmation | n/a |
| Time Gallery brands (Behrens, ClockClock24, Graham, Ikepod, Raketa, Nivada Grenchen) | `authorized_retailer` (provisional) | Sponsored launch article (search result) | Generic "independent brands" until a current list is confirmed | No |
| Independent watchmakers | UNCLASSIFIED, one row per maker | | | No |

## Wording guide (Arabic)

| Relationship | Say | Do not say |
| --- | --- | --- |
| Event access | حضرنا… / كنا في… | شركاء مع… / وكلاء… |
| Interview or content | حوار مع… / استضفنا… | تعاون مع… |
| Manufacture visit | زرنا مصنع… | شراكة مع… |
| Media coverage | ذكرتنا… | رعاية… |
| Authorized retailer | وكيل معتمد لـ… (only with the authorization on file) | |
| Collaboration | بالتعاون مع… (only with the agreement on file) | |

`node check-story.mjs` enforces this: a scene that names a house without a row here fails, and partnership wording fails unless the class is `authorized_retailer` or `collaboration` with evidence.

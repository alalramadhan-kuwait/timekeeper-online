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
| Gerald Charles | UNCLASSIFIED (the brief says a retail or collaboration relationship may be described more specifically where supported) | | | No |
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

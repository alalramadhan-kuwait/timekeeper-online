# Real photographs (not in git)

Gérald Genta and the Royal Oak appear as their own photographs, cut out as paper. All come from Wikimedia Commons
under free licences and are credited on screen in the last scene. `src/` keeps the downloads; the files the film
uses are made from them (cut-outs by Higgsfield's background remover, crops in Python).

| id | made from | author, licence |
| --- | --- | --- |
| `genta.png` | [File:Gerald Genta.jpg](https://commons.wikimedia.org/wiki/File:Gerald_Genta.jpg), portrait, March 2005 | Studio Luxury Griffes, GFDL / CC BY-SA 3.0 |
| `ro_front.png`, `ro_bezel.jpg` | [File:Audemars Piguet Royal Oak ref. 15202.jpg](https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_ref._15202.jpg) | OpaleHorse, CC BY-SA 4.0 |
| `ro_finish.jpg` | [File:Royal Oak bracelet.jpg](https://commons.wikimedia.org/wiki/File:Royal_Oak_bracelet.jpg) | Myles Gray, CC BY-SA 4.0 |
| `ro_cal.jpg` | [File:Calibro Audemars Piguet 2121 ... ref. 14802 del 1992.jpg](https://commons.wikimedia.org/wiki/File:Calibro_Audemars_Piguet_2121_con_rotore_personalizzato_e_numerato_per_i_20_anni_dalla_nascita_del_Royal_Oak._Montato_sulla_ref._14802_del_1992..jpg) | EMore98, CC BY-SA 4.0 |

The watch photographed is a ref. 15202, the 5402's direct successor (same 39 mm Jumbo design); the film labels it so.
No free photograph of a 5402ST was found: a photo of one you own or may use can replace `ro_front.png` (cut out,
transparent PNG) and the label in scene 6 can then go. The adapted cut-outs and crops are shared under the same
CC BY-SA licences.

## Paper characters (`gen/`)

Paper-craft illustrations made on Higgsfield (`nano_banana_2`, 2k) with Genta's 2005 portrait as the face reference,
then cut out with Higgsfield's background remover (the backdrop has a gradient, so `cut-poses.py` does not apply).
`aspects.json` holds each cut-out's width / height for film.py.

| file | pose | job |
| --- | --- | --- |
| `genta_table_cut.png` | at the drafting table, pencil on a blank sheet (the approved test image) | 0b532f5b |
| `genta_phone_cut.png` | standing, on a black rotary phone | a0dae66d |
| `genta_think_cut.png` | standing, hand at his chin | b8a0dba3 |
| `genta_sheet_cut.png` | holding up a blank sheet (the sketch is drawn onto it in the film) | 1e5a466b |
| `genta_present_cut.png` | presenting with an open, empty palm | 304768ae |
| `golay_phone_cut.png` | Georges Golay seen from behind on the phone: no photo of him was available, so no face | 131f7aa7 |

Genta is drawn as he looks in the portrait (the user chose this over a younger version the model would have had to
imagine). The watch is never generated: hands and sheets are empty and the real photo is placed in the scene.

Younger Genta (about forty, for the 1970-72 story), made from the approved 1970 test image with the portrait as a
second reference: `young_table_cut.png` (c0561fe2), `young_phone_cut.png` (98744836), `young_think_cut.png`
(a90c31a4), `young_present_cut.png` (60623514). The film opens on his real portrait and his older paper self, then
runs the clock back to 1970 and tells the story with the younger character; the ending returns to the older one.
The younger face is the model's guess from the later portrait.

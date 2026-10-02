#!/usr/bin/env python3
"""Source of the proposed Arabic narration. Writes 05-NARRATION-AR.md.  Lines are (id, text, pause_after_s, intent, status).
Status: F = FOUNDER VERIFIED, P = PUBLIC (source seen, page not opened), M = VISUAL METAPHOR, ? = needs founder detail."""
import re, os
HERE = os.path.dirname(os.path.abspath(__file__))
WPS = 2.3   # words per second, slow documentary read

EP = {
1: ('قبل تايم كيبر', [
 ('E1-01', 'تايم كيبر… ما بدأ كمحل ساعات.', 1.2, 'Black. A mechanical tick. A small paper watch hand starts to move.', 'F'),
 ('E1-02', 'ما كان في محل. ولا شركة. ولا حتى خطة.', 1.0, 'Pull back: a paper map of the United States unfolds.', 'F'),
 ('E1-03', 'كان في ثلاثة أصدقاء… يحبون الساعات.', 0.8, 'Three empty paper places on the map.', 'F'),
 ('E1-04', 'في بولدر، كولورادو… التقى علي الرمضان وعلي اليوسفي. كانوا يدرسون.', 0.6, 'Boulder. Real university photo.', 'F'),
 ('E1-05', 'ومع الأيام… صارت الساعات تدخل بكلامهم. بس ما كانوا خبراء… كانوا يكتشفون.', 0.8, 'Two friends, one watch between them. Question marks, not answers.', 'F'),
 ('E1-06', 'وبعدها، في سان دييغو، كاليفورنيا… تعرفوا على محمد بن وائل اليوسفي.', 0.5, 'Map unfolds west. Plane. San Diego photo.', 'F'),
 ('E1-07', 'وصاروا ثلاثة.', 1.2, 'Three paper people, one table, three watches. The world is almost empty.', 'F'),
 ('E1-08', 'وخلصت الدراسة… ورجعوا الكويت. وكانوا ينتظرون حياتهم العملية تبدأ.', 0.6, 'Suitcases close. Plane USA to Kuwait. Kuwait Towers rise from paper.', 'F'),
 ('E1-09', 'وكانوا يلتقون… وكلام الساعات ما ينتهي.', 0.5, 'The table again: phones, laptop, magazines, watches.', 'F'),
 ('E1-10', 'بس كل ما تعمقوا… لاحظوا شي. المعلومات عن الساعات موجودة… لكن أغلبها بالإنجليزي.', 0.6, 'English information piles up on one side.', 'F'),
 ('E1-11', 'وبالعربي؟ قليل اللي يشرح لك بشكل بسيط وواضح.', 0.8, 'The Arabic side stays tiny.', 'F'),
 ('E1-12', 'ليش ساعة غالية… وساعة رخيصة؟ شنو يعني حركة ميكانيكية؟ شنو التعقيدات؟', 1.5, 'Question cards arrive; more questions stay on screen, unspoken.', 'F'),
 ('E1-13', 'أسئلة بسيطة… بس ما كان سهل تلقى لها جواب بالعربي.', 1.0, 'Cards stack. Silence begins.', 'F'),
 ('E1-14', 'فقالوا… ليش ما نبسطها؟', 2.0, 'Everything stops. A small Time Keeper mark. Not a business.', 'F'),
 ('E1-15', 'وهني… بدأت الفكرة.', 0.5, 'Hold. CUT.', 'F'),
]),
2: ('الفكرة تكبر', [
 ('E2-01', 'الغريب؟ إحنا ما خططنا نبيع ساعات بالبداية.', 1.0, 'An empty social post frame.', 'F'),
 ('E2-02', '٢٠١٨… بدينا بشي بسيط: نشرح الساعات بالعربي.', 0.6, 'Banner 2018. Real early posts drop in.', 'F'),
 ('E2-03', 'بوست… بعد بوست. نشرح الحركة… وأجزاء الساعة… وتاريخها… ونفرّق بين الماركات.', 0.5, 'The founders break a complicated watch into simple pieces.', 'F'),
 ('E2-04', 'نبي ناخذ الشي المعقد… ونسويه بسيط.', 1.0, 'Pieces named in Arabic.', 'F'),
 ('E2-05', 'والناس بدت تتابع… وتسأل.', 0.5, 'Notifications begin.', 'F'),
 ('E2-06', 'وين أحصلها؟ تقدرون توفرونها؟ من وين نشتريها؟', 1.0, 'Three real-style messages. Replace with real screenshots.', 'F'),
 ('E2-07', 'إحنا بدينا نشرح الساعات… والناس بدت تطلب الساعات اللي نتكلم عنها.', 0.8, 'The demand came from the community.', 'F'),
 ('E2-08', 'فبدينا نوفر ساعات نحبها ونثق فيها… الثقة هي اللي فتحت الباب.', 1.2, 'An educational post folds into a watch box. CONTENT to COMMERCE.', 'F'),
 ('E2-09', 'وما وقفنا نشرح. إنستقرام… مقالات… تطبيق… فيديو.', 0.6, 'The platform widens, education still in front.', 'F'),
 ('E2-10', '٢٠١٩… جاء البودكاست. وما عدنا نتكلم عن عالم الساعات بس… صرنا نتكلم مع الناس اللي فيه.', 1.0, 'A microphone drops onto the table. Real podcast photos.', 'F'),
 ('E2-11', 'وبعدين بدينا نسافر. جنيف… سويسرا. معارض… ومصانع.', 0.8, 'Passport, stamp, plane, Geneva. Real photographs.', 'F'),
 ('E2-12', 'من أكبر دور الساعات في العالم… إلى صُنّاع الساعات المستقلين.', 1.0, 'Real photos at events and workshops. No logo wall. Every house classified first.', '?'),
 ('E2-13', 'بالبداية كنا ندور المعلومة…', 1.2, 'The same three paper people, now walking into the watch world.', 'F'),
 ('E2-14', 'وبعد سنوات… صرنا نروح للمصدر.', 1.5, 'The emotional payoff. Hold.', 'F'),
 ('E2-15', 'تايم كيبر ما عاد مجرد حساب…', 1.0, 'Kuwait joined by paper lines to Switzerland and the wider world.', 'F'),
 ('E2-16', 'صار مجتمع.', 1.0, 'CUT.', 'F'),
]),
3: ('من مجتمع… إلى علامة', [
 ('E3-01', 'وبعدين… الحساب صار مكان حقيقي.', 1.0, 'A phone folds down and becomes a door. The door opens.', 'M'),
 ('E3-02', '٢٠٢٢… فتحنا صالة تايم كيبر. بموعد. وفيها ناس… مو بس أرفف.', 0.8, 'Banner: Time Keeper Lounge 2022. Real photos: conversation, collectors, watches.', 'F'),
 ('E3-03', 'ساعات… وهواة جمع… وسوالف ما تخلص.', 0.6, 'The Lounge fills with people.', 'F'),
 ('E3-04', 'وما كفى نتكلم عن الساعات… ولا حتى نبيعها. صرنا نشارك بأفكارنا فيها.', 0.8, 'Dial, numerals, hands, case, crown, strap fall into place like layered paper.', '?'),
 ('E3-05', 'إصدارات محدودة… وتعاونات.', 1.0, 'Real documented editions only.', 'P'),
 ('E3-06', 'وبعدها… تايم غاليري، بالصالحية.', 0.6, 'The paper Salhiya building rises. Real storefront photo.', 'F'),
 ('E3-07', 'مكان نقدم فيه صُنّاع ساعات مستقلين للكويت.', 0.8, 'Independent brands in the display, only those truly stocked.', 'P'),
 ('E3-08', 'والمجتمع كبر. هواة جمع… ضيوف… صُنّاع ساعات… وزوار من برّا.', 0.8, 'Events, trunk shows, guests. The founders shrink in the frame.', 'F'),
 ('E3-09', 'ولا عدنا إحنا بس.', 1.0, 'Three people become a crowd.', 'M'),
 ('E3-10', 'وجا معرض «الأندر في الكويت». ساعات نادرة… عند هواة كويتيين.', 0.8, 'Darker, museum light, spotlights. Pieces belong to the collectors.', 'P'),
 ('E3-11', 'مو بيع… هذي ثقافة ساعات.', 1.2, 'Slow, elegant, quiet.', 'F'),
 ('E3-12', 'وبعدها… الأفنيوز.', 1.0, 'The Avenues rises from layered paper. Real photo.', 'F'),
 ('E3-13', 'بس أكبر شي… مو المحل.', 0.8, 'The store is not the ending.', 'M'),
 ('E3-14', 'أكبر شي… إن اللي كانوا يدورون المعلومة… صاروا جزء من الحديث.', 1.5, 'The realisation. Everything fades except the three friends.', 'M'),
 ('E3-15', 'القصة ما بدأت بمحل.', 1.0, 'Boulder, the original photograph.', 'F'),
 ('E3-16', 'ولا بدأت بخطة عمل.', 1.0, 'The old table.', 'F'),
 ('E3-17', 'بدأت بثلاثة أصدقاء… يحبون الساعات.', 0.8, 'The three students, young.', 'F'),
 ('E3-18', 'شافوا إن المعلومة بالعربي ناقصة… وقرروا يبسطونها.', 0.6, 'Early content.', 'F'),
 ('E3-19', 'من بوست…', 0.3, 'POST.', 'F'),
 ('E3-20', 'إلى بودكاست…', 0.3, 'MICROPHONE.', 'F'),
 ('E3-21', 'إلى مجتمع…', 0.3, 'PEOPLE.', 'F'),
 ('E3-22', 'إلى العالم.', 1.5, 'International footage.', 'F'),
 ('E3-23', 'والوقت… كان مجرد البداية.', 2.0, 'Time Keeper mark. One mechanical TICK. Black.', 'F'),
]),
}
HOOKS = {
1: [('A (brief, recommended)', 'تايم كيبر… ما بدأ كمحل ساعات.', 'States the surprise in six words and sets up the whole film.'),
    ('B', 'قبل ما يصير في تايم كيبر… كان في ثلاثة أصدقاء… وسؤال.', 'More intimate, hides the twist until later.'),
    ('C', 'لو قلت لك إن تايم كيبر بدأ بسؤال… مو بمحل؟', 'Direct address, but sounds more like an ad.')],
2: [('A (brief, recommended)', 'الغريب؟ إحنا ما خططنا نبيع ساعات بالبداية.', 'Contradicts what viewers assume. Opens a gap Episode 2 answers.'),
    ('B', 'بدينا نشرح الساعات… وما توقعنا اللي صار.', 'Softer, less specific.'),
    ('C', 'ما كنا نبي نبيع… بس الناس طلبت.', 'Strong, but gives the turning point away in the first line.')],
3: [('A (brief, recommended)', 'وبعدين… الحساب صار مكان حقيقي.', 'Picks up Episode 2 and promises a physical payoff.'),
    ('B', 'مجتمع كامل… وما عنده مكان يجتمع فيه.', 'States the problem first, the door comes second.'),
    ('C', 'تخيل… حساب إنستقرام يفتح له باب.', 'Visual and playful, slightly less emotional.')],
}
TAGS = {'F': 'FOUNDER', 'P': 'PUBLIC (to confirm)', 'M': 'METAPHOR', '?': 'NEEDS FOUNDER DETAIL'}
def words(t): return len([w for w in re.split(r'\s+', re.sub(r'[…\.\،\؟\?\!:«»]', ' ', t)) if w.strip()])
out = ['# Gate 4 proposal: complete Arabic narration (Kuwaiti dialect)\n',
 'Status key per line: **FOUNDER** supplied by the founders, **PUBLIC (to confirm)** seen in public sources but the page could not be opened from this environment, **METAPHOR** idea expressed visually, **NEEDS FOUNDER DETAIL** the line promises something only the founders can specify.\n',
 '## Rules this draft follows\n',
 '- **Voice.** Before Time Keeper exists the story is told about the friends ("they": كانوا، التقوا، قرروا). From 2018, the founders take over and it becomes "we" (إحنا، بدينا، فتحنا). The closing look back returns to "they". This reconciles the brief, which mixes both. **Needs your approval.**',
 '- Years used: 2018, 2019, 2022 only, all from the brief. No numbers, followers or prices.',
 '- No house is named in narration. The international line talks about "the biggest houses" and "independent watchmakers", never a brand, so no relationship is implied.',
 '- Timing is an estimate at about 2.3 words a second plus the pauses marked. Real timing comes from the recording.\n']
tot_all = 0
for e, (title, lines) in EP.items():
    sp = sum(words(l[1]) / WPS for l in lines); ps = sum(l[2] for l in lines); tot = sp + ps; tot_all += tot
    out.append(f'\n## Episode {e}: «{title}»\n')
    out.append(f'**{len(lines)} lines, {sum(words(l[1]) for l in lines)} words, about {tot:.0f} seconds** ({sp:.0f} s speaking, {ps:.0f} s of pauses).\n')
    out.append('### Hook options (test before approval)\n\n| Option | Line | Why |\n| --- | --- | --- |')
    for o, t, w in HOOKS[e]: out.append(f'| {o} | {t} | {w} |')
    out.append('\n### Narration\n\n| Line | Narration | Pause after | What the picture does | Status |\n| --- | --- | --- | --- | --- |')
    for i, t, p, v, s in lines: out.append(f'| {i} | **{t}** | {p:.1f} s | {v} | {TAGS[s]} |')
out.append('\n## Cliffhangers\n\n- **Episode 1** ends on «وهني… بدأت الفكرة.» and cuts. The viewer wants to know what the idea became.\n- **Episode 2** ends on «صار مجتمع.» An optional extra line before the cut, «والمجتمع… بدأ يدور على بيت»، points straight into Episode 3. Say if you want it.\n- **Episode 3** pays off with the realisation in E3-14, then returns to the beginning and ends on the tick.\n')
out.append('## Open points in the text\n\n1. **E2-12 and E3-05/07:** the wording is deliberately generic until each house and edition is classified (see 03-ASSET-CHECKLIST.md and ../BRAND-RELATIONS.md).\n2. **E3-04:** "we began contributing our ideas to watches" needs the founders to say what Time Keeper actually contributed to each edition.\n3. **E3-10:** the public record says the pieces belong to Kuwaiti collectors and the exhibition was in October 2025. The line says so. The founders should confirm.\n4. **Sequence.** The brief puts the Lounge (2022) before Time Gallery. A public article calls Time Gallery the first store. Dates for Time Gallery and The Avenues are needed before the order is locked.\n')
out.append(f'\nTotal across the three episodes: about {tot_all:.0f} seconds of narration and pauses. Episode 3 is longest because the closing return to the beginning needs room; the brief asks for story over length.\n')
open(os.path.join(HERE, '05-NARRATION-AR.md'), 'w').write('\n'.join(out))
for e, (title, lines) in EP.items():
    sp = sum(words(l[1]) / WPS for l in lines); ps = sum(l[2] for l in lines)
    print('ep%d  %d lines  %d words  ~%.0fs' % (e, len(lines), sum(words(l[1]) for l in lines), sp + ps))

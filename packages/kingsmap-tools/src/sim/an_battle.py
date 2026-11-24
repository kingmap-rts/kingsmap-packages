"""Analyse packages/kingsmap-tools/src/sim/out/battle.jsonl (doctrine stress suite)."""
import json, sys, statistics as st
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else 'packages/kingsmap-tools/src/sim/out/battle.jsonl'
rows = [json.loads(l) for l in open(path) if l.strip()]
errs = [r for r in rows if 'error' in r]
ok = [r for r in rows if 'error' not in r]
med = lambda xs: round(st.median(xs), 1) if xs else None
mean = lambda xs: round(sum(xs) / len(xs), 2) if xs else None
pct = lambda a, b: f"{100 * a / b:.0f}%" if b else '-'
UNIQUE = {'guild': 'builder', 'shadow': 'arsonist', 'forge': 'golem', 'land': 'militia'}

print(f"матчів {len(rows)}, помилок {len(errs)}")
for e in errs[:3]: print('  ERR', e['tag'], e['seed'], e['error'][:300])

# determinism: 'det' reruns seeds already played under 'free'
free = {r['seed']: r['hash'] for r in ok if r['tag'] == 'free'}
det = [r for r in ok if r['tag'] == 'det']
same = sum(1 for r in det if free.get(r['seed']) == r['hash'])
print(f"детермінізм: {same}/{len(det)} повторів дали той самий стан")

# pace by scenario
print("\nТЕМП ГРИ (за сценарієм)")
print(f"{'сценарій':14}{'n':>3}{'кінець,хв':>10}{'перемога':>9}{'1-ше вибув.,хв':>15}{'вибуло':>7}{'живих':>6}{'30% карти,хв':>13}")
by = defaultdict(list)
for r in ok:
    if r['tag'] != 'det': by[r['tag']].append(r)
order = ['none', 'free', 'rot', 'half', 'crys_half'] + sorted(t for t in by if t.startswith('mirror'))
for tag in order:
    rs = by.get(tag, [])
    if not rs: continue
    first = [min(p['stats']['elimAt'] for p in r['res'] if p['stats']['elimAt'] is not None) / 60 for r in rs if any(p['stats']['elimAt'] is not None for p in r['res'])]
    print(f"{tag:14}{len(rs):>3}{med([r['t'] / 60 for r in rs]):>10}{pct(sum(1 for r in rs if r['winner'] is not None), len(rs)):>9}"
          f"{med(first) or '-':>15}{mean([10 - r['nAlive'] for r in rs]):>7}{mean([r['nAlive'] for r in rs]):>6}{med([r['t30'] for r in rs if r['t30']]) or '-':>13}")

# doctrine strength (players who actually had the doctrine), rot + free
print("\nСИЛА ДОКТРИН (rot + free, лише ті, хто встиг обрати)")
print(f"{'доктрина':10}{'гравців':>8}{'сер.місце':>10}{'вижили':>8}{'перемоги':>9}{'земля%':>8}{'обрали,хв':>10}{'юнітів':>7}")
ps = [(r, p) for r in ok if r['tag'] in ('rot', 'free') for p in r['res']]
for d in ['guild', 'shadow', 'forge', 'land', None]:
    g = [(r, p) for r, p in ps if p['doc'] == d]
    if not g: continue
    print(f"{d or 'без':10}{len(g):>8}{mean([p['rank'] for _, p in g]):>10}{pct(sum(p['alive'] for _, p in g), len(g)):>8}"
          f"{pct(sum(1 for r, p in g if r['winner'] == p['id']), len(g)):>9}{mean([100 * p['land'] for _, p in g]):>8}"
          f"{med([p['stats']['docAt'] / 60 for _, p in g if p['stats']['docAt'] is not None]) or '-':>10}"
          f"{mean([p['units'].get(UNIQUE[d], 0) for _, p in g]) if d else '-':>7}")
print("  (без = не набрав 3 мани; це переважно ті, хто програвав ще до середини гри)")

# rot: assigned doctrine regardless of whether reached -> unbiased by wealth
print("\nПРИЗНАЧЕНА ДОКТРИНА (rot, усі місця, без відбору за багатством)")
asg = defaultdict(list)
for r in ok:
    if r['tag'] != 'rot': continue
    for p in r['res']: asg[p['P'].get('doc')].append(p)
for d, g in asg.items():
    print(f"  {d:8} сер.місце {mean([p['rank'] for p in g])}, вижили {pct(sum(p['alive'] for p in g), len(g))}, дійшли до доктрини {pct(sum(1 for p in g if p['doc']), len(g))}")

# half: with vs without doctrines
print("\nЗ ДОКТРИНАМИ vs БЕЗ (сценарій half, однакові місця по черзі)")
h = [p for r in ok if r['tag'] == 'half' for p in r['res']]
for lab, g in (('з доктриною', [p for p in h if not p['P'].get('noDoc')]), ('без доктрини', [p for p in h if p['P'].get('noDoc')])):
    print(f"  {lab:13} n={len(g)} сер.місце {mean([p['rank'] for p in g])}, вижили {pct(sum(p['alive'] for p in g), len(g))}, земля {mean([100 * p['land'] for p in g])}%")

# tiers & mana
print("\nМАНА І СТУПЕНІ")
for tag in ('rot', 'free', 'crys_half'):
    g = [p for r in ok if r['tag'] == tag for p in r['res']]
    if not g: continue
    tiers = [len(p['perks']) + (1 if p['doc'] else 0) for p in g]
    surv = [p for p in g if p['alive']]
    print(f"  {tag:10} доктрина {pct(sum(t >= 1 for t in tiers), len(g))}, ст.4 (ульта) {pct(sum(t >= 4 for t in tiers), len(g))}; "
          f"видобуто (медіана живих) {med([p['stats']['crystals'] for p in surv])}, лишилось невитраченої {med([p['crystalLeft'] for p in surv])}, макс {max([p['crystalLeft'] for p in surv] or [0])}")

# perks: within a tier, compare the two options (both were taken by players who reached that tier)
print("\nПЕРКИ: порівняння всередині ступеня (сер.місце, менше = краще)")
DOCP = {'guild': [['carav', 'cheap'], ['repair', 'reach'], ['ward', 'road']], 'shadow': [['burn60', 'tough'], ['bag', 'scorch'], ['panic', 'night']],
        'forge': [['cheapsiege', 'deploy'], ['ammo', 'walls'], ['rain', 'rally']], 'land': [['bread', 'growth'], ['labor', 'granary'], ['pitch', 'charter']]}
allp = [p for r in ok if r['tag'] in ('rot', 'free', 'crys_half') or r['tag'].startswith('mirror') for p in r['res']]
for d, tiers in DOCP.items():
    line = []
    for i, (a, b) in enumerate(tiers):
        ga = [p['rank'] for p in allp if p['doc'] == d and len(p['perks']) > i and p['perks'][i] == a]
        gb = [p['rank'] for p in allp if p['doc'] == d and len(p['perks']) > i and p['perks'][i] == b]
        line.append(f"{a} {mean(ga)}({len(ga)}) / {b} {mean(gb)}({len(gb)})")
    print(f"  {d:7} " + ' | '.join(line))

# ults
print("\nУЛЬТИ: застосувань за матч у тих, хто її мав")
casts = defaultdict(list)
for p in allp:
    if len(p['perks']) == 3: casts[p['perks'][2]].append(p['stats']['casts'])
print('  ' + ', '.join(f"{k} {mean(v)} (n={len(v)})" for k, v in sorted(casts.items())))

# mirrors: what each doctrine does to the game
print("\nДЗЕРКАЛА (усі 10 з однією доктриною) — сума по матчу")
keys = [('sabotage', 'підпалів'), ('convoysKilled', 'караванів знищ.'), ('kills', 'вбивств'), ('starved', 'загинули з голоду'), ('delivered', 'доставлено')]
for tag in ['none'] + sorted(t for t in by if t.startswith('mirror')):
    rs = by.get(tag, [])
    if not rs: continue
    vals = [mean([sum(p['stats'][k] for p in r['res']) for r in rs]) for k, _ in keys]
    print(f"  {tag:15} " + ', '.join(f"{lab} {round(v)}" for (k, lab), v in zip(keys, vals)))

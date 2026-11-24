"""Compare bot matches with and without squads (packages/kingsmap-tools/src/sim/out/squads.jsonl)."""
import json, sys, statistics as st
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else 'packages/kingsmap-tools/src/sim/out/squads.jsonl') if l.strip()]
med = lambda x: round(st.median(x), 1) if x else '-'
mean = lambda x: round(sum(x) / len(x), 1) if x else '-'
pct = lambda a, b: f"{round(100 * a / b)}%" if b else '-'
print('матчів', len(rows), 'помилок', sum('error' in r for r in rows))
S = lambda r, k: sum(p['stats'][k] for p in r['res'])
print(f"\n{'':10}{'n':>3}{'перемог':>9}{'живих':>7}{'1-ше вибув.':>12}{'медіана вибув.':>15}{'лідер %':>8}{'вбивств':>9}{'найнято':>9}{'піковa армія':>13}{'голод':>7}{'захоплень':>10}{'підпалів':>9}")
for tag in ('sq_off', 'sq_on', 'sq_half'):
    rs = [r for r in rows if r.get('tag') == tag and 'error' not in r]
    if not rs: continue
    el = [p['stats']['elimAt'] / 60 for r in rs for p in r['res'] if p['stats']['elimAt'] is not None]
    first = [min(p['stats']['elimAt'] for p in r['res'] if p['stats']['elimAt'] is not None) / 60 for r in rs if any(p['stats']['elimAt'] is not None for p in r['res'])]
    print(f"{tag:10}{len(rs):>3}{sum(r['winner'] is not None for r in rs):>9}{mean([r['nAlive'] for r in rs]):>7}{med(first):>12}{med(el):>15}{med([max(r['shares'][-1]) for r in rs]):>8}"
          f"{mean([S(r, 'kills') for r in rs]):>9}{mean([S(r, 'hired') for r in rs]):>9}{mean([sum(p['stats']['peakArmy'] for p in r['res']) / 10 for r in rs]):>13}{mean([S(r, 'starved') for r in rs]):>7}{mean([S(r, 'captures') for r in rs]):>10}{mean([S(r, 'sabotage') for r in rs]):>9}")
h = [p for r in rows if r.get('tag') == 'sq_half' and 'error' not in r for p in r['res']]
print('\nсценарій half (половина ботів збирає загони, половина ні, місця по черзі):')
for lab, g in (('із загонами', [p for p in h if not p['P'].get('noSquad')]), ('без загонів', [p for p in h if p['P'].get('noSquad')])):
    print(f"  {lab:12} n={len(g)}  сер.місце {mean([p['rank'] for p in g])}  вижили {pct(sum(p['alive'] for p in g), len(g))}  перемоги {sum(1 for r in rows if r.get('tag') == 'sq_half' for p in r['res'] if p in g and r['winner'] == p['id'])}"
          f"  земля {mean([100 * p['land'] for p in g])}%  вбивств {mean([p['stats']['kills'] for p in g])}  втрат {mean([p['stats']['unitsLost'] for p in g])}  співвідн. {round(sum(p['stats']['kills'] for p in g) / max(1, sum(p['stats']['unitsLost'] for p in g)), 2)}")
# same seeds: how often the same kingdom ends on top
on = {r['seed']: r for r in rows if r.get('tag') == 'sq_on' and 'error' not in r}
off = {r['seed']: r for r in rows if r.get('tag') == 'sq_off' and 'error' not in r}
same = sum(1 for s in on if s in off and [p['id'] for p in on[s]['res'] if p['rank'] == 1] == [p['id'] for p in off[s]['res'] if p['rank'] == 1])
print(f"\nна тих самих картах лідер той самий у {same} з {len([s for s in on if s in off])} матчів")

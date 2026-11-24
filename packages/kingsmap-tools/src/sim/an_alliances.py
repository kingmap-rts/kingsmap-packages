"""Compare matches with and without bot diplomacy (packages/kingsmap-tools/src/sim/out/alliances.jsonl)."""
import json, sys, statistics as st
rows = [json.loads(l) for l in open(sys.argv[1] if len(sys.argv) > 1 else 'packages/kingsmap-tools/src/sim/out/alliances.jsonl') if l.strip()]
med = lambda x: round(st.median(x), 1) if x else '-'
mean = lambda x: round(sum(x) / len(x), 1) if x else '-'
print('помилок', sum('error' in r for r in rows))
for tag in ('ally_off', 'ally_on'):
    rs = [r for r in rows if r.get('tag') == tag and 'error' not in r]
    if not rs: continue
    P = [p for r in rs for p in r['res']]
    first = [min(p['stats']['elimAt'] for p in r['res'] if p['stats']['elimAt'] is not None) / 60 for r in rs if any(p['stats']['elimAt'] is not None for p in r['res'])]
    print(f"\n{tag}: матчів {len(rs)}")
    print(f"  перемог за 35 хв {sum(r['winner'] is not None for r in rs)}/{len(rs)}, живих наприкінці {mean([r['nAlive'] for r in rs])}, 1-ше вибуття {med(first)} хв, лідер наприкінці {med([max(r['shares'][-1]) for r in rs])}%")
    print(f"  пактів на матч {mean([sum(p['stats']['pacts'] for p in r['res']) / 2 for r in rs])}, зрад {mean([sum(p['stats']['betrayals'] for p in r['res']) for r in rs])}, подарунків {mean([sum(p['stats']['giftsSent'] for p in r['res']) for r in rs])} ресурсів")
    print(f"  вбивств {mean([sum(p['stats']['kills'] for p in r['res']) for r in rs])}, підпалів {mean([sum(p['stats']['sabotage'] for p in r['res']) for r in rs])}, захоплень {mean([sum(p['stats']['captures'] for p in r['res']) for r in rs])}")
    al = [p for p in P if p['stats']['pacts'] > 0]; no = [p for p in P if p['stats']['pacts'] == 0]
    if tag == 'ally_on':
        print(f"  з союзом: n={len(al)} сер.місце {mean([p['rank'] for p in al])}, вижили {round(100*sum(p['alive'] for p in al)/max(1,len(al)))}%; без союзу: n={len(no)} сер.місце {mean([p['rank'] for p in no])}, вижили {round(100*sum(p['alive'] for p in no)/max(1,len(no)))}%")
        el = [p for p in P if p['stats']['elimBy'] is not None]
        print(f"  хто вибив — записано у {len(el)} з {sum(p['stats']['elimAt'] is not None for p in P)} вибуттів")

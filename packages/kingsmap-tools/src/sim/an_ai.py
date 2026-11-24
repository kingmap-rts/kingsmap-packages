# Compare AI versions from packages/kingsmap-tools/src/sim/run.ts output.
#   python3 packages/kingsmap-tools/src/sim/an_ai.py out/ai_old.jsonl out/ai_new.jsonl out/ai_mixed.jsonl
import json, sys, statistics as st
from math import comb

def load(f):
    try: return [json.loads(l) for l in open(f)]
    except FileNotFoundError: return []

def pct(xs, q):
    xs = sorted(xs); return xs[min(len(xs)-1, int(q*len(xs)))] if xs else None

def summary(name, R):
    if not R: print(name, 'no data'); return
    n = len(R)
    ended = [r for r in R if r['winner'] is not None]
    lead20 = [max(r['shares'][19]) for r in R if len(r['shares']) > 19]
    leadEnd = [max(r['shares'][-1]) for r in R]
    elims = [10 - r['nAlive'] for r in R]
    s = lambda k: st.mean(sum((p['stats'].get(k) or 0) for p in r['res']) for r in R)
    idle = st.mean(st.mean(p['idleShare'] for p in r['res'] if p['idleShare'] is not None) for r in R)
    t40 = [r['t40'] for r in R if r['t40'] is not None]
    t30 = [r['t30'] for r in R if r['t30'] is not None]
    print(f"\n== {name}: {n} matches, {R[0]['t']//60 if R else 0}+ min")
    print(f"  ended (someone won): {len(ended)}/{n}  by: {dict((k, sum(1 for r in ended if r['reason']==k)) for k in set(r['reason'] for r in ended))}")
    if ended: print(f"  end minute median {st.median(r['t'] for r in ended)/60:.1f}")
    print(f"  leader share @20m median {st.median(lead20):.1f}%  p90 {pct(lead20,.9)}   at end median {st.median(leadEnd):.1f}%")
    print(f"  reached 30%: {len(t30)}/{n} (median min {st.median(t30) if t30 else '-'})   reached 40%: {len(t40)}/{n}")
    print(f"  eliminated players per match: mean {st.mean(elims):.2f}")
    print(f"  per match: waves {s('waves'):.0f}, HQ targets {s('hqTargets'):.0f}, HQ dmg {s('hqDmg'):.0f}, captures {s('captures'):.0f}, depots destroyed {s('depotsDestroyed'):.0f}, recalls {s('recalls'):.0f}")
    print(f"  idle inf/siege share {idle:.2f}   ms/match {st.mean(r['ms'] for r in R)/1000:.1f}s")

def mixed(R):
    if not R: return
    new_win = old_win = new_top3 = old_top3 = 0; new_alive = old_alive = 0; nn = no = 0
    for r in R:
        for p in r['res']:
            isnew = bool(p['P'].get('ai2'))
            if isnew: nn += 1; new_top3 += p['rank'] <= 3; new_win += p['rank'] == 1; new_alive += p['alive']
            else: no += 1; old_top3 += p['rank'] <= 3; old_win += p['rank'] == 1; old_alive += p['alive']
    print(f"\n== mixed: {len(R)} matches (5 new vs 5 old bots each)")
    print(f"  rank 1:  new {new_win}/{len(R)}  old {old_win}/{len(R)}")
    print(f"  top 3:   new {new_top3/nn:.0%}  old {old_top3/no:.0%}")
    print(f"  alive at end: new {new_alive/nn:.0%}  old {old_alive/no:.0%}")
    # exact binomial test on rank-1 count (H0: p=0.5)
    k, n = new_win, new_win + old_win
    if n:
        p = sum(comb(n, i) for i in range(n+1) if comb(n, i) <= comb(n, k)) / 2**n
        print(f"  binomial test new vs old winner: p={p:.3f}")

old, new, mix = (load(f) for f in sys.argv[1:4])
summary('OLD AI', old); summary('NEW AI', new); mixed(mix)

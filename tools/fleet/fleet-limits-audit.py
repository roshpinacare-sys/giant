#!/usr/bin/env python3
# fleet-limits-audit.py — ביקורת-הכסף-התקוע-בלימיטים של הצי (הוראת-הבעלים: "יש גם כסף תקוע בלימיטים של הצי")
# מדידה-חיה בלבד מול השרשרת: יתרות · הזמנות-פתוחות (גיל! סכומים-תחומים!) · SP-מטריצה · ציד.
# אפס-סודות · קריאה-בלבד · פלט-JSON אחד כנה.
import json, urllib.request, sys
from datetime import datetime, timezone

RPC = "https://api.steemit.com"

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode()).get("result")

def amt(v):
    if isinstance(v, str):
        try: return float(v.split(" ")[0].replace(",", ""))
        except Exception: return 0.0
    if isinstance(v, dict):
        try: return float(v.get("amount", 0)) / (10 ** int(v.get("precision", 3)))
        except Exception: return 0.0
    return 0.0

ACCOUNTS = ["headcorner", "acct-00"]
now = datetime.now(timezone.utc)

out = {"measuredAt": now.isoformat(), "accounts": {}}

# 1. יתרות + מטריצת-SP לשני-החשבונות
accs = rpc("condenser_api.get_accounts", [ACCOUNTS]) or []
sp_map = {}
for a in accs:
    name = a.get("name")
    vest_own, vest_out, vest_in = amt(a.get("vesting_shares")), amt(a.get("delegated_vesting_shares")), amt(a.get("received_vesting_shares"))
    sp_map[name] = {"vestOwn": vest_own, "vestOut": vest_out, "vestIn": vest_in,
                    "steemFree": amt(a.get("balance")), "sbdFree": amt(a.get("sbd_balance")),
                    "rc": amt((a.get("rc_manabar") or {}).get("current_mana"))}
out["vestGlobal"] = {k: rpc("condenser_api.get_dynamic_global_properties", []).get(k) for k in []}

# vest→SP conversion
g = rpc("condenser_api.get_dynamic_global_properties", [])
tvf, tvs = amt(g.get("total_vesting_fund_steem")), amt(g.get("total_vesting_shares"))
v2sp = (vests := 0) or 0
def vests_to_sp(v):
    return (v * tvf / tvs) if tvs > 0 else 0.0

# 2. הזמנות-פתוחות — הלימיטים עצמם
for name in ACCOUNTS:
    orders = (rpc("database_api.list_limit_orders", {"start": [name, 0], "limit": 100, "order": "by_account"}) or {}).get("orders", [])
    mine = []
    sbd_locked = steem_locked = 0.0
    for o in orders:
        if str(o.get("seller")) != name: continue
        sp = o.get("sell_price") or {}
        base, quote = sp.get("base"), sp.get("quote")
        bcur = (base.split(" ")[1] if isinstance(base, str) else "?")
        qcur = (quote.split(" ")[1] if isinstance(quote, str) else "?")
        fs = float(o.get("for_sale", 0)) / 1000.0
        price = None
        if bcur == "SBD" and qcur == "STEEM": price = amt(base) / amt(quote)
        if bcur == "STEEM" and qcur == "SBD": price = amt(quote) / amt(base)
        created = str(o.get("created", ""))
        age_h = None
        try:
            ct = datetime.fromisoformat(created.replace("Z", "+00:00"))
            age_h = round((now - ct).total_seconds() / 3600.0, 1)
        except Exception: pass
        if bcur == "SBD": sbd_locked += fs
        if bcur == "STEEM": steem_locked += fs
        mine.append({"orderid": o.get("orderid"), "side": "SELL-" + bcur, "forSale": fs,
                     "priceSbdPerSteem": round(price, 6) if price else None, "ageHours": age_h, "created": created})
    v = sp_map.get(name, {})
    out["accounts"][name] = {
        "steemFree": v.get("steemFree"), "sbdFree": v.get("sbdFree"),
        "steemLocked": round(steem_locked, 3), "sbdLocked": round(sbd_locked, 3),
        "steemTotal": round(v.get("steemFree", 0) + steem_locked, 3),
        "sbdTotal": round(v.get("sbdFree", 0) + sbd_locked, 3),
        "lockedPct": round(100.0 * (sbd_locked + steem_locked * 0) / max(sbd_locked + v.get("sbdFree", 0), 0.0001), 1),
        "sbdLockedPct": round(100.0 * sbd_locked / max(sbd_locked + v.get("sbdFree", 0), 0.0001), 1),
        "openOrders": mine, "openOrderCount": len(mine),
        "spOwn": round(vests_to_sp(v.get("vestOwn", 0)), 2),
        "spDelegatedOut": round(vests_to_sp(v.get("vestOut", 0)), 2),
        "spReceivedIn": round(vests_to_sp(v.get("vestIn", 0)), 2),
        "spIdleHeadroom": round(vests_to_sp(v.get("vestOwn", 0) - v.get("vestOut", 0)), 2),
        "rcMana": v.get("rc"),
        "oldestOrderHours": max([o["ageHours"] for o in mine if o["ageHours"] is not None], default=0),
    }

# 3. היסטוריה — פעילות אחרונה (fills/ציד) לשני-החשבונות
for name in ACCOUNTS:
    hist = rpc("condenser_api.get_account_history", [name, -1, 60]) or []
    fills = 0; votes = 0; last_op_ts = None
    for _, ev in hist:
        op = ev.get("op")
        t = op[0] if isinstance(op, list) else str((op or {}).get("type", ""))
        t = t.replace("_operation", "").replace("Operation", "").replace("_", "-")
        if t == "fill-order": fills += 1
        if t == "vote": votes += 1
        last_op_ts = ev.get("timestamp") or last_op_ts
    out["accounts"][name]["window"] = {"fills": fills, "votes": votes, "lastOpAt": last_op_ts, "windowOps": len(hist)}

print(json.dumps(out, indent=1, ensure_ascii=False))

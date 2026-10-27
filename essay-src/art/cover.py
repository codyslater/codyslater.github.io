#!/usr/bin/env python3
"""Generative cover art: neurons drawn as RNA secondary structures.

Essay: "Musings on how RNA might be important for neurons to compute".

Each neuron is ONE RNA molecule drawn the way VARNA / RNAplot draw secondary
structure: a single continuous backbone, stems as ladders of base-pair rungs,
loops as rings. The soma is a large multiloop; dendrites are branching stems
with internal loops, bulges and further multiloops, ending in hairpins; the
axon is a long stem with bulges that is steered across the frame into a
kissing-loop interaction (two hairpin loops paired by a few dashed bonds)
with a dendrite hairpin of the next neuron.

No folding is done. A structure tree is grown together with its geometry
(a naview-like radial layout: every loop is a circle through its nucleotides,
every stem a straight ladder) and every new element is collision-checked
against everything already drawn, so arbors spread outward instead of
overlapping. All randomness flows from one seeded random.Random.

Usage:
    python cover.py --seed 7 --out-dir DIR [--name cover] [--png] [--webp]

Writes DIR/<name>.svg (master, 1200x630) and, with --png, DIR/<name>.png at
2400x1260 plus DIR/<name>-zoom.png (a 4x view of one soma/dendrite junction),
rasterised by headless Chrome. --webp also writes DIR/<name>.webp via Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import shutil
import subprocess
import tempfile

W, H = 1200, 630

# palette (site dark theme)
BG = "#0a0a0a"
GOLD = "#d9b77e"
CREAM = "#e8e2d5"
MUTED = "#9a9288"
BASE_FILL = {"A": "#93ab95", "U": "#c39282", "G": "#d9b77e", "C": "#93a4ba"}

P_RATIO = 1.45  # base-pair rung length / backbone step


# ---------------------------------------------------------------- vectors
def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def mul(a, k):
    return (a[0] * k, a[1] * k)


def norm(a):
    L = math.hypot(a[0], a[1]) or 1.0
    return (a[0] / L, a[1] / L)


def rot90(a):
    return (-a[1], a[0])


def ang(a):
    return math.atan2(a[1], a[0])


def unit(t):
    return (math.cos(t), math.sin(t))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angdiff(a, b):
    d = (a - b) % (2 * math.pi)
    return d - 2 * math.pi if d > math.pi else d


# ---------------------------------------------------------------- spatial hash
class Grid:
    def __init__(self, cell):
        self.cell = cell
        self.d = {}

    def add(self, p, owner):
        k = (int(p[0] // self.cell), int(p[1] // self.cell))
        self.d.setdefault(k, []).append((p[0], p[1], owner))

    def hit(self, p, rad, exclude=()):
        c = self.cell
        cx, cy = int(p[0] // c), int(p[1] // c)
        r = int(rad // c) + 1
        r2 = rad * rad
        for i in range(cx - r, cx + r + 1):
            for j in range(cy - r, cy + r + 1):
                for x, y, o in self.d.get((i, j), ()):
                    if o in exclude:
                        continue
                    if (x - p[0]) ** 2 + (y - p[1]) ** 2 < r2:
                        return True
        return False


# ---------------------------------------------------------------- structure
class Stem:
    def __init__(self, sid, pairs, loop=None, role="dend"):
        self.id = sid
        self.pairs = pairs  # [(pos5, pos3, scale)] outer -> inner
        self.loop = loop
        self.role = role


class Loop:
    """items: ('u', pos, scale) unpaired nucleotide | ('s', Stem)."""

    def __init__(self, lid, kind, center, radius, items, scale):
        self.id = lid
        self.kind = kind
        self.center = center
        self.radius = radius
        self.items = items
        self.scale = scale
        self.nt_idx = []  # filled at emission: indices of this loop's own unpaired nts
        self.out_dir = None


def solve_radius(gaps):
    lo = max(gaps) / 2 + 1e-9
    hi = sum(gaps)
    f = lambda R: sum(2 * math.asin(min(1.0, g / (2 * R))) for g in gaps) - 2 * math.pi
    if f(lo) < 0:
        return lo
    for _ in range(80):
        mid = (lo + hi) / 2
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def loop_gaps(spec, b, p, closing):
    """spec: list of 'u' / 'c'. Returns list of gap lengths, closing last."""
    gaps = []
    for it in spec:
        if it == "u":
            gaps.append(b)
        else:
            gaps.append(b)
            gaps.append(p)
    gaps.append(b)
    gaps.append(closing)
    return gaps


def layout_closed_loop(Mtop, d, s, B, spec, exit_psi=None):
    """Circle through the closing pair (on the stem top) and the loop content.

    Returns (center, R, points) where points follow 5'->3' order between the
    closing pair: one point per 'u', two (k, l) per 'c'.  Child exits are
    radial at their chord midpoints.  With exit_psi (internal loop, single
    child) the child chord is centred at that absolute angle and the unpaired
    nts are spread evenly on each side.
    """
    b = B * s
    p = P_RATIO * b
    gaps = loop_gaps(spec, b, p, p)
    R = solve_radius(gaps)
    h = math.sqrt(max(R * R - (p / 2) ** 2, 0.0))
    C = add(Mtop, mul(d, h))
    n = rot90(d)
    i5 = add(Mtop, mul(n, -p / 2))
    th_i = ang(sub(i5, C))
    a_p = 2 * math.asin(min(1.0, p / (2 * R)))
    pts = []
    if exit_psi is None:
        t = th_i
        for g in gaps[:-1]:
            t += 2 * math.asin(min(1.0, g / (2 * R)))
            pts.append(add(C, mul(unit(t), R)))
        pts = pts[:-1]  # last point is j' itself
    else:
        th_j = th_i + 2 * math.pi - a_p
        psi = th_i + ((exit_psi - th_i) % (2 * math.pi))
        th_k, th_l = psi - a_p / 2, psi + a_p / 2
        na = spec.index("c")
        nb = len(spec) - na - 1
        for m in range(1, na + 1):
            pts.append(add(C, mul(unit(th_i + (th_k - th_i) * m / (na + 1)), R)))
        pts.append(add(C, mul(unit(th_k), R)))
        pts.append(add(C, mul(unit(th_l), R)))
        for m in range(1, nb + 1):
            pts.append(add(C, mul(unit(th_l + (th_j - th_l) * m / (nb + 1)), R)))
    return C, R, pts


def internal_spacing(Mtop, d, s, B, a, bb, psi):
    """Max relative deviation of backbone spacing for an exit-overridden internal loop."""
    spec = ["u"] * a + ["c"] + ["u"] * bb
    C, R, pts = layout_closed_loop(Mtop, d, s, B, spec, exit_psi=psi)
    b = B * s
    p = P_RATIO * b
    n = rot90(d)
    i5 = add(Mtop, mul(n, -p / 2))
    j3 = add(Mtop, mul(n, p / 2))
    seq = [i5] + pts[:a + 1]
    seq2 = pts[a + 1:] + [j3]
    dev = 0.0
    for q in (seq, seq2):
        for u, v in zip(q, q[1:]):
            dev = max(dev, abs(dist(u, v) / b - 1.0))
    return dev, C, R, pts


# ---------------------------------------------------------------- molecule growth
class World:
    def __init__(self, rng, B, bounds_margin=70):
        self.rng = rng
        self.B = B
        self.grid = Grid(B * 2.0)
        self.next_id = 1
        self.margin = bounds_margin
        self.hairpins = []  # (loop, mol)
        self.collisions = 0
        self.axon_scores = []

    def nid(self):
        self.next_id += 1
        return self.next_id

    def in_bounds(self, p):
        m = self.margin
        return -m < p[0] < W + m and -m < p[1] < H + m

    def clear(self, pts, s, exclude, rad_k=1.3):
        rad = rad_k * self.B * s
        for p in pts:
            if not self.in_bounds(p):
                return False
            if self.grid.hit(p, rad, exclude):
                return False
        return True

    def register(self, pts, owner):
        for p in pts:
            self.grid.add(p, owner)


def stem_geometry(M, d, n_bp, s0, s1, B):
    n = rot90(d)
    pairs = []
    along = 0.0
    for m in range(n_bp):
        s = s0 + (s1 - s0) * (m / max(1, n_bp - 1))
        if m > 0:
            along += B * s
        p = P_RATIO * B * s
        c = add(M, mul(d, along))
        pairs.append((add(c, mul(n, -p / 2)), add(c, mul(n, p / 2)), s))
    return pairs


def stem_probe_pts(pairs, start=2):
    out = []
    for p5, p3, _ in pairs[start:]:
        out += [p5, p3, mul(add(p5, p3), 0.5)]
    return out


class Neuron:
    def __init__(self, name, center, scale, plane):
        self.name = name
        self.center = center
        self.scale = scale
        self.plane = plane
        self.soma = None
        self.soma_R = 0
        self.hairpins = []
        self.axon_tip = None  # loop
        self.nt = 0


def top_of(pairs):
    p5, p3, s = pairs[-1]
    return mul(add(p5, p3), 0.5), s


def grow_branch(world, neu, M, d, s0, depth, parent_loop_id, resv_id, P):
    """Grow a dendrite stem from chord midpoint M in direction d. Returns Stem or None."""
    rng = world.rng
    B = world.B
    s1 = max(P["min_scale"], s0 * P["taper"])
    n_lo, n_hi = P["stem_bp"]
    n_want = rng.randint(n_lo, n_hi) if depth > 0 else rng.randint(*P["trunk_bp"])
    excl = {parent_loop_id, resv_id}
    cap_spec = ["u"] * 4
    pairs = None
    for n_bp in range(n_want, 2, -1):
        cand = stem_geometry(M, d, n_bp, s0, s1, B)
        top, st = top_of(cand)
        _, _, cap = layout_closed_loop(top, d, st, B, cap_spec)
        if world.clear(stem_probe_pts(cand) + cap, st, excl):
            pairs = cand
            break
    if pairs is None:
        return None
    sid = world.nid()
    world.register(stem_probe_pts(pairs, 1), sid)
    stem = Stem(sid, pairs)
    top, st = top_of(pairs)
    excl_loop = {sid, parent_loop_id, resv_id}

    # choose loop type
    budget_left = neu.nt < P["max_nt"]
    r = rng.random()
    kind = "hairpin"
    if depth < P["max_depth"] and budget_left:
        pm = P["p_multi"][min(depth, len(P["p_multi"]) - 1)]
        if r < pm:
            kind = "multi"
        elif r < pm + P["p_internal"]:
            kind = "internal"

    loop = None
    if kind in ("multi", "internal"):
        loop = try_branch_loop(world, neu, top, d, st, depth, kind, excl_loop, P)
    if loop is None:
        loop = make_hairpin(world, neu, top, d, st, excl_loop, P)
    stem.loop = loop
    neu.nt += 2 * len(pairs)
    return stem


def make_hairpin(world, neu, top, d, s, excl, P, size=None):
    rng = world.rng
    B = world.B
    sizes = [size] if size else list(range(rng.randint(*P["hairpin_nt"]), 3, -1)) + [3]
    best = None
    for nh in sizes:
        C, R, pts = layout_closed_loop(top, d, s, B, ["u"] * nh)
        best = (nh, C, R, pts)
        if world.clear(pts, s, excl, rad_k=1.15):
            break
    nh, C, R, pts = best
    lid = world.nid()
    world.register(pts, lid)
    loop = Loop(lid, "hairpin", C, R, [("u", q, s) for q in pts], s)
    loop.out_dir = d
    neu.hairpins.append(loop)
    neu.nt += nh
    return loop


def try_branch_loop(world, neu, top, d, s, depth, kind, excl, P):
    rng = world.rng
    B = world.B
    if kind == "internal":
        k = 1
    else:
        k = 3 if rng.random() < P["p_three"] else 2
    for _attempt in range(3):
        if kind == "internal":
            a, bb = rng.choice([(1, 0), (0, 1), (1, 1), (2, 1), (1, 2), (2, 2), (3, 1), (1, 3), (0, 2), (2, 0)])
            spec = ["u"] * a + ["c"] + ["u"] * bb
        else:
            spec = ["u"] * rng.randint(*P["ml_flank"])
            for ci in range(k):
                spec.append("c")
                if ci < k - 1:
                    spec += ["u"] * rng.randint(*P["ml_inner"])
            spec += ["u"] * rng.randint(*P["ml_flank"])
        C, R, pts = layout_closed_loop(top, d, s, B, spec)
        # map child exits
        exits = []
        it = iter(pts)
        unp = []
        for e in spec:
            if e == "u":
                unp.append(next(it))
            else:
                kpt, lpt = next(it), next(it)
                mid = mul(add(kpt, lpt), 0.5)
                exits.append((kpt, lpt, mid, norm(sub(mid, C))))
        if not world.clear(unp, s, excl, rad_k=1.15):
            if kind == "internal":
                continue
            k = max(1, k - 1)
            continue
        # probe children
        s_child = s
        ok = []
        for (kpt, lpt, mid, dc) in exits:
            radial = norm(sub(mid, neu.center))
            if sum(x * y for x, y in zip(dc, radial)) < P["outward_min"]:
                ok.append(False)
                continue
            probe = stem_geometry(mid, dc, 3, s_child, s_child * P["taper"], B)
            ptop, pst = top_of(probe)
            _, _, cap = layout_closed_loop(ptop, dc, pst, B, ["u"] * 3)
            ok.append(world.clear(stem_probe_pts(probe) + cap, pst, excl))
        if all(ok):
            break
        if kind == "internal":
            continue
        nk = sum(ok)
        if nk == 0:
            return None
        k = nk
    else:
        return None
    lid = world.nid()
    world.register(unp, lid)
    resv = []
    for (kpt, lpt, mid, dc) in exits:
        rid = world.nid()
        probe = stem_geometry(mid, dc, 3, s, s * P["taper"], B)
        world.register(stem_probe_pts(probe), rid)
        resv.append(rid)
    neu.nt += len(unp)
    items = []
    it = iter(pts)
    ei = 0
    children = []
    for e in spec:
        if e == "u":
            items.append(("u", next(it), s))
        else:
            next(it), next(it)
            items.append(None)  # placeholder for child stem
            children.append((len(items) - 1, exits[ei], resv[ei]))
            ei += 1
    loop = Loop(lid, kind, C, R, items, s)
    for idx, (kpt, lpt, mid, dc), rid in children:
        child = grow_branch(world, neu, mid, dc, s, depth + 1, lid, rid, P)
        if child is None:
            child = forced_stub(world, neu, mid, dc, s, lid, rid, P)
        items[idx] = ("s", child)
    return loop


def forced_stub(world, neu, M, d, s, parent_id, rid, P):
    pairs = stem_geometry(M, d, 2, s, s, world.B)
    sid = world.nid()
    world.register(stem_probe_pts(pairs, 1), sid)
    st = Stem(sid, pairs)
    top, ts = top_of(pairs)
    st.loop = make_hairpin(world, neu, top, d, ts, {sid, parent_id, rid}, P, size=3)
    world.collisions += 1
    return st


# ---------------------------------------------------------------- soma + axon
def build_soma(world, neu, n_dend, axon_angle, P):
    """Root multiloop. Returns (loop, list of exit tuples, axon exit index)."""
    rng = world.rng
    B = world.B
    s = neu.scale
    b = B * s
    p = P_RATIO * b
    k = n_dend + (1 if axon_angle is not None else 0)
    spec = []
    for ci in range(k):
        spec += ["u"] * rng.randint(*P["soma_linker"])
        spec.append("c")
    spec += ["u"] * rng.randint(*P["soma_linker"])
    # 5' end point first, then spec, then 3' end point; open gap between ends
    gaps = [b]  # 5'end -> first element
    for e in spec:
        if e == "u":
            gaps.append(b)
        else:
            gaps.append(p)
            gaps.append(b)
    gaps.append(2.0 * b)  # open gap 3' end -> 5' end
    R = solve_radius(gaps)
    # angles relative to 5' end at 0
    angles = [0.0]
    t = 0.0
    for g in gaps[:-1]:
        t += 2 * math.asin(min(1.0, g / (2 * R)))
        angles.append(t)
    # positions list: [5'end] + spec points + [3'end]
    # find the axon chord (choose a child index for it)
    child_pos = []
    pi = 1
    for e in spec:
        if e == "u":
            pi += 1
        else:
            child_pos.append(pi)
            pi += 2
    ax_i = rng.randrange(k) if axon_angle is not None else None
    if axon_angle is not None:
        q = child_pos[ax_i]
        mid_t = (angles[q] + angles[q + 1]) / 2
        rot = axon_angle - mid_t
    else:
        rot = rng.uniform(0, 2 * math.pi)
    pts = [add(neu.center, mul(unit(a + rot), R)) for a in angles]
    neu.soma_R = R
    lid = world.nid()
    unp = []
    items = [("u", pts[0], s)]
    exits = []
    pi = 1
    for e in spec:
        if e == "u":
            items.append(("u", pts[pi], s))
            unp.append(pts[pi])
            pi += 1
        else:
            kpt, lpt = pts[pi], pts[pi + 1]
            mid = mul(add(kpt, lpt), 0.5)
            exits.append((kpt, lpt, mid, norm(sub(mid, neu.center))))
            items.append(None)
            pi += 2
    items.append(("u", pts[-1], s))
    unp += [pts[0], pts[-1]]
    world.register(unp, lid)
    loop = Loop(lid, "soma", neu.center, R, items, s)
    neu.soma = loop
    neu.nt += len(unp)
    return loop, exits, ax_i


def place_children_of_soma(world, neu, loop, exits, ax_i, axon_target, P):
    s = neu.scale
    lid = loop.id
    slots = [i for i, it in enumerate(loop.items) if it is None]
    resv = []
    for (kpt, lpt, mid, dc) in exits:
        rid = world.nid()
        probe = stem_geometry(mid, dc, 3, s, s * P["taper"], world.B)
        world.register(stem_probe_pts(probe), rid)
        resv.append(rid)
    order = list(range(len(exits)))
    if ax_i is not None:
        order.remove(ax_i)
        order = [ax_i] + order
    for ci in order:
        kpt, lpt, mid, dc = exits[ci]
        if ci == ax_i:
            stem = grow_axon_best(world, neu, mid, dc, s, lid, resv[ci], axon_target, P)
        else:
            stem = grow_branch(world, neu, mid, dc, s, 0, lid, resv[ci], P)
            if stem is None:
                stem = forced_stub(world, neu, mid, dc, s, lid, resv[ci], P)
        loop.items[slots[ci]] = ("s", stem)


def rollback(world, id0):
    for k, lst in world.grid.d.items():
        world.grid.d[k] = [q for q in lst if q[2] <= id0]


def grow_axon_best(world, neu, M, d, s_soma, parent_id, resv_id, target, P, tries=10):
    """Grow the axon several times from saved RNG states; keep the cleanest."""
    rng = world.rng
    results = []
    for t in range(tries):
        state = rng.getstate()
        id0, c0, nt0, hp0 = world.next_id, world.collisions, neu.nt, list(neu.hairpins)
        target.pop("_passed", None)
        grow_axon(world, neu, M, d, s_soma, parent_id, resv_id, target, P)
        col = world.collisions - c0
        err = dist(neu.axon_tip.center, target["point"]) / world.B if (target["kind"] == "synapse" and neu.axon_tip) else 0.0
        score = col * 3 + err
        results.append((score, t, state))
        rollback(world, id0)
        world.next_id, world.collisions, neu.nt, neu.hairpins = id0, c0, nt0, hp0
        neu.axon_tip = None
        if col == 0 and err < 0.6:
            break
    score, t, state = min(results)
    end_state = rng.getstate()
    rng.setstate(state)
    target.pop("_passed", None)
    root = grow_axon(world, neu, M, d, s_soma, parent_id, resv_id, target, P)
    world.axon_scores.append(round(score, 2))
    rng.setstate(end_state)
    return root


def grow_axon(world, neu, M, d, s_soma, parent_id, resv_id, target, P):
    """Axon: chain of stems joined by steered internal loops/bulges.

    target: dict(kind='synapse', point=Ca, R=Ra) or dict(kind='exit', point=xy).
    Built recursively as nested Stem -> internal Loop -> Stem ...
    """
    rng = world.rng
    B = world.B
    s_ax = s_soma * P["axon_scale"]
    segs = []  # list of (pairs, loop_spec_or_None) built iteratively
    cur_M, cur_d, cur_s = M, d, s_soma
    excl_base = {parent_id, resv_id}
    if target.get("exclude"):
        excl_base |= set(target["exclude"])
    root = None
    prev_loop_items = None
    prev_slot = None
    max_turn = math.radians(P["axon_max_turn"])
    for step in range(60):
        Ca = target["point"]
        to = sub(Ca, cur_M)
        remaining = math.hypot(*to)
        seg_lo, seg_hi = P["axon_seg_bp"]
        final = target["kind"] == "synapse" and remaining < (seg_hi + 6) * B * s_ax
        if final:
            # hairpin centre must land on Ca: n chosen from distance
            hp_n = P["kiss_hairpin_nt"]
            _, Rh, _ = layout_closed_loop((0, 0), (0, 1), s_ax, B, ["u"] * hp_n)
            hh = math.sqrt(Rh * Rh - (P_RATIO * B * s_ax / 2) ** 2)
            n_bp = max(2, int(round((remaining - hh) / (B * s_ax))) + 1)
        else:
            n_bp = rng.randint(seg_lo, seg_hi)
        pairs = stem_geometry(cur_M, cur_d, n_bp, cur_s, s_ax, B)
        sid = world.nid()
        pts = stem_probe_pts(pairs, 1)
        if not world.clear(stem_probe_pts(pairs, 2), s_ax, excl_base | {sid}, rad_k=1.1):
            world.collisions += 1
        world.register(pts, sid)
        stem = Stem(sid, pairs, role="axon")
        if root is None:
            root = stem
        else:
            prev_loop_items[prev_slot] = ("s", stem)
        top, st = top_of(pairs)
        if final:
            loop = make_hairpin(world, neu, top, cur_d, st, excl_base | {sid}, P, size=P["kiss_hairpin_nt"])
            neu.hairpins.remove(loop)
            stem.loop = loop
            neu.axon_tip = loop
            neu.nt += 2 * n_bp
            break
        if (target["kind"] == "exit" and not (0 < top[0] < W and 0 < top[1] < H) and step > 1) or step == 59:
            loop = make_hairpin(world, neu, top, cur_d, st, excl_base | {sid}, P)
            neu.hairpins.remove(loop)
            stem.loop = loop
            neu.nt += 2 * n_bp
            break
        # steer: toward the approach waypoint (on the target hairpin's axis) until
        # close to it, then toward Ca itself, with a little wander
        aim = Ca
        Wp = target.get("approach")
        if Wp is not None and not target.get("_passed"):
            if dist(top, Wp) < 10 * B * s_ax or dist(top, Ca) < dist(Wp, Ca):
                target["_passed"] = True
            else:
                aim = Wp
        want = ang(sub(aim, top)) + rng.gauss(0, math.radians(P["axon_wander"]))
        turn = max(-max_turn, min(max_turn, angdiff(want, ang(cur_d))))
        # if the next segment is final, aim exactly (iterate exit point)
        psi = ang(cur_d) + turn
        best = None
        for a in range(0, 5):
            for bb in range(0, 5):
                if a + bb == 0 or a + bb > 5:
                    continue
                dev, C, R, lpts = internal_spacing(top, cur_d, st, B, a, bb, psi)
                score = dev + 0.04 * (a + bb)
                if best is None or score < best[0]:
                    best = (score, a, bb, C, R, lpts)
        _, a, bb, C, R, lpts = best
        # if the next stem will be the last one, aim its axis exactly through Ca:
        # the exit is radial from the loop centre, so psi = angle(Ca - C)
        if target["kind"] == "synapse" and dist(Ca, top) < (seg_hi + 6) * B * s_ax + 3 * B:
            psi = ang(sub(Ca, C))
            dev, C, R, lpts = internal_spacing(top, cur_d, st, B, a, bb, psi)
        k_pt, l_pt = lpts[a], lpts[a + 1]
        mid = mul(add(k_pt, l_pt), 0.5)
        lid = world.nid()
        unp = lpts[:a] + lpts[a + 2:]
        world.register(unp, lid)
        items = [("u", q, st) for q in lpts[:a]] + [None] + [("u", q, st) for q in lpts[a + 2:]]
        loop = Loop(lid, "internal", C, R, items, st)
        stem.loop = loop
        neu.nt += 2 * n_bp + len(unp)
        prev_loop_items, prev_slot = items, a
        cur_M = mid
        cur_d = norm(sub(mid, C))
        cur_s = st
        excl_base = {lid, sid} | (set(target.get("exclude") or ()))
    return root


# ---------------------------------------------------------------- emission
def emit(neu):
    """Walk the tree 5'->3'. Returns nts [(x,y,s)], pairs [(i,j)]."""
    nts = []
    pairs = []

    def emit_loop(loop):
        for it in loop.items:
            if it[0] == "u":
                loop.nt_idx.append(len(nts))
                nts.append(it[1:])
            else:
                emit_stem(it[1])

    def emit_stem(stem):
        idx5 = []
        for p5, p3, s in stem.pairs:
            idx5.append(len(nts))
            nts.append((p5, s))
        stem.loop.close5 = idx5[-1]
        emit_loop(stem.loop)
        for (p5, p3, s), i in zip(reversed(stem.pairs), reversed(idx5)):
            pairs.append((i, len(nts)))
            nts.append((p3, s))

    emit_loop(neu.soma)
    return nts, pairs


def assign_sequence(rng, n, pairs):
    seq = [None] * n
    for i, j in pairs:
        r = rng.random()
        if r < 0.52:
            a, b = rng.choice([("G", "C"), ("C", "G")])
        elif r < 0.88:
            a, b = rng.choice([("A", "U"), ("U", "A")])
        else:
            a, b = rng.choice([("G", "U"), ("U", "G")])
        seq[i], seq[j] = a, b
    for k in range(n):
        if seq[k] is None:
            seq[k] = rng.choices("AUGC", weights=[0.38, 0.27, 0.2, 0.15])[0]
    return seq


# ---------------------------------------------------------------- scene
VARIANTS = {
    "a": dict(  # three wired foreground neurons over a dim background plane
        B=5.0,
        fg=[
            dict(name="A", at=(285, 335), scale=1.1, n_dend=7, max_nt=1900, axon="B", tint=GOLD, op=1.0),
            dict(name="B", at=(890, 200), scale=1.0, n_dend=6, max_nt=1400, axon="C", tint="#e3cc9d", op=0.94),
            dict(name="C", at=(700, 545), scale=0.9, n_dend=5, max_nt=1000, axon=("exit", (1270, 700)),
                 tint="#c99f63", op=0.86),
        ],
        bg=[
            dict(name="d", at=(70, 60), scale=1.0, n_dend=5, max_nt=520, axon="e"),
            dict(name="e", at=(560, 60), scale=0.95, n_dend=5, max_nt=480, axon=("exit", (700, -70))),
            dict(name="f", at=(1140, 520), scale=0.9, n_dend=5, max_nt=480, axon=("exit", (1270, 300))),
            dict(name="g", at=(420, 610), scale=0.85, n_dend=4, max_nt=380, axon=("exit", (300, 710))),
            dict(name="h", at=(585, 395), scale=0.9, n_dend=5, max_nt=420, axon="g"),
        ],
        bgB=2.7,
        order=["C", "B", "A"],
        bgorder=["g", "f", "e", "h", "d"],
    ),
}

GROWTH = dict(
    stem_bp=(4, 9),
    trunk_bp=(3, 6),
    taper=0.93,
    min_scale=0.55,
    max_depth=6,
    p_multi=[0.8, 0.65, 0.5, 0.4, 0.3, 0.2],
    p_internal=0.3,
    p_three=0.3,
    ml_flank=(2, 4),
    ml_inner=(1, 3),
    hairpin_nt=(4, 8),
    soma_linker=(3, 6),
    outward_min=-0.15,
    axon_scale=0.8,
    axon_seg_bp=(6, 11),
    axon_max_turn=22,
    axon_wander=8,
    kiss_hairpin_nt=8,
    approach_len=16,
)


def pick_synapse(world, src_center, src_R, tgt, P):
    """Choose a target dendrite hairpin facing the source with a clear path."""
    B = world.B
    best = None
    s_ax = P["axon_scale"]
    _, Ra, _ = layout_closed_loop((0, 0), (0, 1), s_ax * 1.0, B, ["u"] * P["kiss_hairpin_nt"])
    for hp in tgt.hairpins:
        if len(hp.items) < 5:
            continue
        to_src = norm(sub(src_center, hp.center))
        face = sum(x * y for x, y in zip(hp.out_dir, to_src))
        if face < 0.2:
            continue
        u = hp.out_dir
        gap = 1.45 * P_RATIO * B * hp.scale
        Ca = add(hp.center, mul(u, hp.radius + Ra + gap))
        Wp = add(Ca, mul(u, P["approach_len"] * B))
        if not (20 < Ca[0] < W - 20 and 20 < Ca[1] < H - 20):
            continue
        # the landing site for the axon's hairpin must be empty
        ring = [Ca] + [add(Ca, mul(unit(t * math.pi / 6), Ra + B)) for t in range(12)]
        if any(world.grid.hit(q, 1.6 * B, exclude={hp.id}) for q in ring):
            continue
        # clear corridor soma edge -> waypoint -> Ca
        start = add(src_center, mul(norm(sub(Wp, src_center)), src_R + 3 * B))
        blocked = 0
        L = 0.0
        for a_, b_ in ((start, Wp), (Wp, Ca)):
            seg = dist(a_, b_)
            L += seg
            steps = max(2, int(seg / (B * 1.5)))
            for i in range(steps + 1):
                q = add(a_, mul(sub(b_, a_), i / steps))
                if world.grid.hit(q, 2.6 * B, exclude={hp.id}):
                    blocked += 1
        # the waypoint leg should not double back on itself
        bend = abs(angdiff(ang(sub(Wp, start)), ang(sub(Ca, Wp))))
        score = blocked * 50 + L / B - 15 * face + 20 * max(0.0, bend - 1.0)
        if best is None or score < best[0]:
            best = (score, hp, Ca, blocked, Wp)
    return best


def build_plane(rng, specs, B, order=None):
    world = World(rng, B)
    # specs give positions in SVG coordinates (y down); geometry is y-up
    neurons = {sp["name"]: Neuron(sp["name"], (sp["at"][0], H - sp["at"][1]), sp["scale"], None) for sp in specs}
    spec_by = {sp["name"]: sp for sp in specs}
    names = order or [sp["name"] for sp in specs][::-1]
    synapses = []
    # targets must exist before their sources' axons: grow in `names` order
    for nm in names:
        sp = spec_by[nm]
        neu = neurons[nm]
        P = dict(GROWTH)
        P["max_nt"] = sp["max_nt"]
        ax = sp.get("axon")
        target = None
        ax_angle = None
        syn = None
        if isinstance(ax, str) and neurons[ax].soma is not None:
            est_R = B * sp["scale"] * 9
            syn = pick_synapse(world, neu.center, est_R, neurons[ax], P)
            if syn:
                _, hp, Ca, blocked, Wp = syn
                target = dict(kind="synapse", point=Ca, approach=Wp, exclude=[hp.id])
                ax_angle = ang(sub(Wp, neu.center))
        if target is None and ax is not None:
            pt = ax[1] if isinstance(ax, tuple) else (W + 100, H / 2)
            pt = (pt[0], H - pt[1])
            target = dict(kind="exit", point=pt)
            ax_angle = ang(sub(pt, neu.center))
        loop, exits, ax_i = build_soma(world, neu, sp["n_dend"], ax_angle, P)
        place_children_of_soma(world, neu, loop, exits, ax_i, target, P)
        if syn and neu.axon_tip is not None:
            synapses.append((neu, neu.axon_tip, neurons[ax], syn[1]))
    return world, list(neurons.values()), synapses


def kiss_bonds(loop_a, loop_b, nts_a, nts_b, n_bonds=3):
    """Pair the facing nts of two hairpin loops, antiparallel (as in a kissing loop)."""
    ia, ib = loop_a.nt_idx, loop_b.nt_idx
    ca, cb = loop_a.center, loop_b.center

    def run(idx, nts, other):
        best = None
        for k in range(len(idx) - n_bonds + 1):
            r = idx[k:k + n_bonds]
            sc = sum(dist(nts[i][0], other) for i in r)
            if best is None or sc < best[0]:
                best = (sc, r)
        return best[1]

    ra, rb = run(ia, nts_a, cb), run(ib, nts_b, ca)
    return list(zip(ra, reversed(rb)))


# ---------------------------------------------------------------- render
def f2(x):
    return f"{x:.2f}"


def svg_doc(scene, viewbox=None, out_w=W, out_h=H):
    vb = viewbox or (0, 0, W, H)
    o = []
    o.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{out_w}" height="{out_h}" '
        f'viewBox="{f2(vb[0])} {f2(vb[1])} {f2(vb[2])} {f2(vb[3])}">'
    )
    o.append("<title>Neurons drawn as RNA secondary structures</title>")
    o.append(
        "<style>"
        ".bb{fill:none;stroke-linejoin:round;stroke-linecap:round}"
        ".rg{stroke-linecap:round}"
        "text{font-family:'DejaVu Sans Mono',Menlo,monospace;font-weight:600;text-anchor:middle;dominant-baseline:central}"
        "</style>"
    )
    o.append("<defs>")
    o.append(
        '<radialGradient id="bgv" cx="50%" cy="48%" r="75%">'
        '<stop offset="0" stop-color="#14110c"/><stop offset="0.6" stop-color="#0c0b09"/>'
        f'<stop offset="1" stop-color="{BG}"/></radialGradient>'
    )
    o.append(
        '<radialGradient id="soma"><stop offset="0" stop-color="#d9b77e" stop-opacity="0.16"/>'
        '<stop offset="0.55" stop-color="#d9b77e" stop-opacity="0.07"/>'
        '<stop offset="1" stop-color="#d9b77e" stop-opacity="0"/></radialGradient>'
    )
    o.append(
        '<radialGradient id="syn"><stop offset="0" stop-color="#f3e6c8" stop-opacity="0.30"/>'
        '<stop offset="0.5" stop-color="#d9b77e" stop-opacity="0.09"/>'
        '<stop offset="1" stop-color="#d9b77e" stop-opacity="0"/></radialGradient>'
    )
    o.append('<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4"/></filter>')
    o.append('<filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.6"/></filter>')
    o.append("</defs>")
    o.append(f'<rect x="-50" y="-50" width="{W + 100}" height="{H + 100}" fill="{BG}"/>')
    o.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#bgv)"/>')

    for plane in scene["planes"]:
        o.append(render_plane(plane))
    o.append("</svg>")
    return "\n".join(o)


def Y(p):
    return (p[0], H - p[1])


def render_plane(plane):
    st = plane["style"]
    B = plane["B"]
    o = []
    o.append(f'<g opacity="{st["opacity"]}"' + (' filter="url(#soft)"' if st.get("blur") else "") + ">")
    # soma halos
    for m in plane["mols"]:
        c = Y(m["soma_c"])
        r = m["soma_R"] * 1.9
        o.append(f'<circle cx="{f2(c[0])}" cy="{f2(c[1])}" r="{f2(r)}" fill="url(#soma)"/>')
    # synapse halos
    for sy in plane["syn"]:
        c = Y(sy["c"])
        o.append(f'<circle cx="{f2(c[0])}" cy="{f2(c[1])}" r="{f2(B * 7)}" fill="url(#syn)"/>')
    # glow backbone
    if st.get("glow"):
        o.append(f'<g filter="url(#glow)" opacity="{st["glow"]}">')
        for m in plane["mols"]:
            o.append(f'<path class="bb" stroke="{GOLD}" stroke-width="{f2(B * 0.9)}" d="{m["path"]}"/>')
        o.append("</g>")
    for m in plane["mols"]:
        nts, seq, pairs = m["nts"], m["seq"], m["pairs"]
        o.append(f'<g opacity="{m["op"]}">')
        # rungs
        for kind, col, wk, op in (("GC", CREAM, 0.30, 0.62), ("AU", CREAM, 0.22, 0.5), ("GU", CREAM, 0.16, 0.42)):
            d = []
            for i, j in pairs:
                pk = "".join(sorted(seq[i] + seq[j]))
                k = {"CG": "GC", "AU": "AU", "GU": "GU"}.get(pk, "AU")
                if k != kind:
                    continue
                a, b = Y(nts[i][0]), Y(nts[j][0])
                d.append(f"M{f2(a[0])} {f2(a[1])}L{f2(b[0])} {f2(b[1])}")
            if d:
                o.append(
                    f'<path class="rg" stroke="{col}" stroke-opacity="{op}" '
                    f'stroke-width="{f2(B * wk)}" d="{"".join(d)}"/>'
                )
        # GU wobble marker
        for i, j in pairs:
            if "".join(sorted(seq[i] + seq[j])) == "GU":
                a = Y(mul(add(nts[i][0], nts[j][0]), 0.5))
                o.append(f'<circle cx="{f2(a[0])}" cy="{f2(a[1])}" r="{f2(B * 0.16 * nts[i][1])}" fill="{CREAM}" fill-opacity="0.7"/>')
        o.append(
            f'<path class="bb" stroke="{m["tint"] or st["backbone"]}" stroke-opacity="{st["bb_op"]}" '
            f'stroke-width="{f2(B * 0.3)}" d="{m["path"]}"/>'
        )
        for k, ((p, s), ch) in enumerate(zip(nts, seq)):
            c = Y(p)
            o.append(
                f'<circle cx="{f2(c[0])}" cy="{f2(c[1])}" r="{f2(B * 0.36 * s)}" '
                f'fill="{BASE_FILL[ch]}" fill-opacity="{st["nt_op"]}"/>'
            )
        if st.get("letters"):
            for k, ((p, s), ch) in enumerate(zip(nts, seq)):
                c = Y(p)
                o.append(
                    f'<text x="{f2(c[0])}" y="{f2(c[1] + B * 0.02)}" font-size="{f2(B * 0.42 * s)}" '
                    f'fill="#16130e" fill-opacity="0.78">{ch}</text>'
                )
        # 5'/3' end labels
        if st.get("letters"):
            for idx, lab in ((0, "5′"), (len(nts) - 1, "3′")):
                p = nts[idx][0]
                v = norm(sub(p, m["soma_c"]))
                q = Y(add(p, mul(v, B * 1.1)))
                o.append(
                    f'<text x="{f2(q[0])}" y="{f2(q[1])}" font-size="{f2(B * 0.5)}" '
                    f'fill="{MUTED}" fill-opacity="0.9">{lab}</text>'
                )
        o.append("</g>")
    # kissing bonds
    for sy in plane["syn"]:
        d = []
        for a, b in sy["bonds"]:
            a, b = Y(a), Y(b)
            d.append(f"M{f2(a[0])} {f2(a[1])}L{f2(b[0])} {f2(b[1])}")
        o.append(
            f'<path stroke="#f3e6c8" stroke-opacity="0.95" stroke-width="{f2(B * 0.26)}" '
            f'stroke-dasharray="{f2(B * 0.22)} {f2(B * 0.2)}" stroke-linecap="butt" d="{"".join(d)}"/>'
        )
    o.append("</g>")
    return "\n".join(o)


def plane_payload(rng, world, neurons, synapses, B, style, specs=()):
    look = {sp["name"]: sp for sp in specs}
    mols = []
    emitted = {}
    for neu in neurons:
        if neu.soma is None:
            continue
        nts, pairs = emit(neu)
        seq = assign_sequence(rng, len(nts), pairs)
        emitted[neu.name] = (nts, seq)
        path = "M" + "L".join(f"{f2(Y(p)[0])} {f2(Y(p)[1])}" for p, s in nts)
        sp = look.get(neu.name, {})
        mols.append(dict(name=neu.name, nts=nts, seq=seq, pairs=pairs, path=path,
                         soma_c=neu.center, soma_R=neu.soma_R,
                         tint=sp.get("tint"), op=sp.get("op", 1.0)))
    syn = []
    comp = {"A": "U", "U": "A", "G": "C", "C": "G"}
    for src, la, tgt, lb in synapses:
        na, sa = emitted[src.name]
        nb, sb = emitted[tgt.name]
        bonds = kiss_bonds(la, lb, na, nb, n_bonds=3)
        for i, j in bonds:
            sa[i] = rng.choice("GC")
            sb[j] = comp[sa[i]]
        segs = [(na[i][0], nb[j][0]) for i, j in bonds]
        c = mul(add(la.center, lb.center), 0.5)
        syn.append(dict(c=c, bonds=segs, gap=[dist(*s) / B for s in segs]))
    return dict(B=B, mols=mols, syn=syn, style=style)


def overlaps(plane, k=0.85):
    """Count nucleotide pairs closer than k*b that are neither chain neighbours
    nor base partners (a drawn overlap). Returns (count, sample svg points)."""
    B = plane["B"]
    g = Grid(B * 2)
    allp = []
    for mi, m in enumerate(plane["mols"]):
        partner = {}
        for i, j in m["pairs"]:
            partner[i], partner[j] = j, i
        for i, (p, s) in enumerate(m["nts"]):
            allp.append((p, s, mi, i, partner.get(i)))
    hits = []
    for idx, (p, s, mi, i, pj) in enumerate(allp):
        g.add(p, idx)
    for idx, (p, s, mi, i, pj) in enumerate(allp):
        rad = k * B * s
        cx, cy = int(p[0] // g.cell), int(p[1] // g.cell)
        for a in (cx - 1, cx, cx + 1):
            for b in (cy - 1, cy, cy + 1):
                for x, y, o in g.d.get((a, b), ()):
                    if o <= idx:
                        continue
                    q, s2, mj, j, _ = allp[o]
                    if mi == mj and (abs(i - j) <= 2 or pj == j):
                        continue
                    if (x - p[0]) ** 2 + (y - p[1]) ** 2 < rad * rad:
                        hits.append(Y(p))
    return len(hits), [(round(h[0]), round(h[1])) for h in hits[:8]]


def make_scene(seed, variant="a"):
    V = VARIANTS[variant]
    rng = random.Random(seed)
    planes = []
    stats = {}
    # background plane
    if V.get("bg"):
        wb, nb, sb = build_plane(rng, V["bg"], V["bgB"], V.get("bgorder"))
        planes.append(plane_payload(rng, wb, nb, sb, V["bgB"], specs=V["bg"], style=dict(
            opacity=0.5, blur=True, glow=0, backbone=MUTED, bb_op=0.9, nt_op=0.45, letters=False)))
        stats["bg_collisions"] = wb.collisions
    wf, nf, sf = build_plane(rng, V["fg"], V["B"], V.get("order"))
    planes.append(plane_payload(rng, wf, nf, sf, V["B"], specs=V["fg"], style=dict(
        opacity=1.0, blur=False, glow=0.18, backbone=GOLD, bb_op=0.92, nt_op=0.62, letters=True)))
    stats["fg_collisions"] = wf.collisions
    stats["axon_scores"] = wf.axon_scores
    stats["nts"] = {m["name"]: len(m["nts"]) for p in planes for m in p["mols"]}
    stats["synapses"] = [round(max(s["gap"]), 2) for p in planes for s in p["syn"]]
    stats["overlaps"] = [overlaps(p) for p in planes]
    fg = planes[-1]
    # zoom target: the largest soma, offset toward one of its exits
    big = max(fg["mols"], key=lambda m: len(m["nts"]))
    return dict(planes=planes, stats=stats, zoom_c=big["soma_c"], zoom_R=big["soma_R"])


def rasterize(svg_path, png_path, w=W, h=H, scale=2):
    chrome = shutil.which("google-chrome") or shutil.which("chromium")
    with tempfile.TemporaryDirectory() as td:
        html = os.path.join(td, "r.html")
        with open(html, "w") as fh:
            fh.write(
                f'<html><body style="margin:0;background:{BG}">'
                f'<img src="file://{os.path.abspath(svg_path)}" width="{w}" height="{h}" style="display:block"></body></html>'
            )
        subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
             "--allow-file-access-from-files", f"--force-device-scale-factor={scale}",
             f"--window-size={w},{h}", f"--screenshot={os.path.abspath(png_path)}", f"file://{html}"],
            check=True, capture_output=True, timeout=180,
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=8)
    ap.add_argument("--variant", default="a")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--name", default="cover")
    ap.add_argument("--png", action="store_true")
    ap.add_argument("--webp", action="store_true")
    ap.add_argument("--zoom", type=float, default=4.0)
    ap.add_argument("--zoom-at", type=str, default=None, help="x,y (svg coords) for the zoom centre")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    scene = make_scene(args.seed, args.variant)
    svg = svg_doc(scene)
    base = os.path.join(args.out_dir, args.name)
    with open(base + ".svg", "w") as fh:
        fh.write(svg)
    if args.zoom_at:
        zx, zy = (float(v) for v in args.zoom_at.split(","))
    else:
        zc = Y(scene["zoom_c"])
        zx, zy = zc[0] + scene["zoom_R"] * 1.25, zc[1] - scene["zoom_R"] * 0.25
    zw, zh = W / args.zoom, H / args.zoom
    zsvg = svg_doc(scene, viewbox=(zx - zw / 2, zy - zh / 2, zw, zh))
    with open(base + "-zoom.svg", "w") as fh:
        fh.write(zsvg)
    if args.png:
        rasterize(base + ".svg", base + ".png")
        rasterize(base + "-zoom.svg", base + "-zoom.png")
        os.remove(base + "-zoom.svg")
    if args.webp:
        from PIL import Image
        Image.open(base + ".png").convert("RGB").save(base + ".webp", "WEBP", quality=88, method=6)
    print(json.dumps(dict(seed=args.seed, variant=args.variant, **scene["stats"],
                          zoom_center=[round(zx), round(zy)])))


if __name__ == "__main__":
    main()

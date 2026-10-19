#!/usr/bin/env python3
"""Télécharge les EDT CELCAT de l'IUT de Nantes et génère site/data.json
pour la page de fréquentation du site de la Fleuriaye (Carquefou).

Usage :
    python scripts/build_data.py                  # télécharge tout et écrit site/data.json
    python scripts/build_data.py --cache ics/     # réutilise / garde les .ics dans un dossier

Aucune dépendance hors bibliothèque standard.
"""
import argparse, collections, datetime as dt, json, os, re, sys, time
import urllib.request, urllib.error
import xml.etree.ElementTree as ET

BASE_URL = "https://edt.univ-nantes.fr/iut_nantes/"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

COHORTS = ['GMP1', 'GMP2', 'GMP3', 'GI1', 'GI2', 'GI3', 'SG1', 'SG2', 'SG3',
           'MT2E1', 'MT2E2', 'MT2E3', 'QLIO1', 'QLIO2', 'QLIO3', 'ITI1', 'ITI2']
COH_RE = re.compile(r'^(GMP|GI|SG|MT2E|QLIO|ITI)([123])')
EXCLUDED_TYPES = {'Alternance', 'Période en entreprise', 'Férié', 'Distanciel', 'Vacances'}
ONSITE_WITHOUT_ROOM = {'TD', 'TP', 'CM', 'Contrôle continu TD', 'Contrôle Continu TP', 'Contrôle continu',
                       'DS', 'Soutenance', 'Projet tutoré 100%', 'Rattrapage TD'}
DAY0 = dt.date(2026, 8, 31)  # lundi de référence (index des jours dans data.json)


def fetch(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'fleuriaye-frequentation (projet etudiant)'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            if k == tries - 1:
                raise
            time.sleep(2 + 3 * k)


def cohort(name):
    m = COH_RE.match(name)
    return m.group(1) + m.group(2) if m else None


def norm(name):
    return re.sub(r'\s*\(.*?\)', '', name).replace(' TD TP', '').strip()


def is_child(child, parent):
    if not child.startswith(parent) or child == parent:
        return False
    nxt = child[len(parent)]
    return nxt in '-/ _' or nxt.isdigit() or nxt.islower()


def kind(suffix):
    s = suffix.lstrip('-/ _')
    if re.fullmatch(r'[A-Z]', s): return 'L'
    if re.fullmatch(r'[a-z]', s): return 'l'
    if re.fullmatch(r'\d', s): return 'd'
    if re.fullmatch(r'G\d', s): return 'G'
    if re.fullmatch(r'G?\d\d', s): return 'GG'
    if re.fullmatch(r'[A-Z]\d', s): return 'Ld'
    if s in ('FI', 'ALT'): return 'FA'
    return 'W:' + re.sub(r'[A-Za-z0-9]+$', '', s.replace('_', '-'))


ROOT_NAMES = ('', 'Tous', 'PROMO', 'Promo')


def group_shares(names, alt_qlio1):
    """Part de la promo représentée par chaque groupe, déduite de l'arborescence des noms."""
    by = collections.defaultdict(list)
    for n in names:
        c = cohort(n)
        if c in COHORTS:
            by[c].append(n)
    share = {}
    for c, gs in by.items():
        nm = {g: norm(g) for g in gs}
        parent = {}
        for g in gs:
            ps = [p for p in gs if is_child(nm[g], nm[p])]
            parent[g] = max(ps, key=lambda p: len(nm[p])) if ps else None
        kids = collections.defaultdict(list)
        for g in gs:
            kids[parent[g]].append(g)

        def suf(x):
            p = parent[x]
            return nm[x][len(nm[p]):] if p else nm[x][len(c):]

        def s(g):
            if g in share:
                return share[g]
            p = parent[g]
            base = 1.0 if p is None else s(p)
            k = kind(suf(g))
            if p is None and suf(g).strip('-/ ') in ROOT_NAMES:
                share[g] = 1.0
                return 1.0
            sib = [x for x in kids[p]
                   if (p is not None or suf(x).strip('-/ ') not in ROOT_NAMES) and kind(suf(x)) == k]
            if k == 'FA':
                has_alt = any(nm[x].endswith('ALT') for x in sib)
                v = base * (0.5 if has_alt else 1.0)
            elif k.startswith('W') and p is None and len(sib) > 6:
                v = base * 0.25
            else:
                v = base / max(1, len(sib))
            if c == 'QLIO1' and k == 'FA':
                v = 1.0 if nm[g].endswith('FI') else alt_qlio1
            share[g] = v
            return v

        for g in gs:
            s(g)
    return share


def unfold(t):
    return re.sub(r'\r?\n[ \t]', '', t)


def parse_events(ics_texts):
    events = {}
    for text in ics_texts:
        t = unfold(text)
        for e in t.split('BEGIN:VEVENT')[1:]:
            def g(k):
                m = re.search(r'^' + k + r'[^:]*:(.*?)\r?$', e, re.M)
                return m.group(1) if m else ''
            uid = g('UID').split('-')[0]
            start = g('DTSTART')
            key = (uid, start)
            if key in events:
                continue
            desc = g('DESCRIPTION').replace('\\n', '\n').replace('\\,', ',')
            groups = []
            for m in re.findall(r'^Groupes? : (.*)$', desc, re.M):
                groups += [x.strip() for x in re.split(r',\s*(?=[A-Z]{2,})', m)]
            mat = re.search(r'^Matière : (.*)$', desc, re.M)
            events[key] = dict(s=start, e=g('DTEND'), sum=g('SUMMARY').replace('\\,', ','),
                               loc=g('LOCATION').strip(), groups=groups, mat=mat.group(1) if mat else '')
    return list(events.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', help="dossier où lire/écrire les .ics (facultatif)")
    ap.add_argument('--offline', action='store_true', help="n'utiliser que le cache, sans télécharger")
    ap.add_argument('--out', default=os.path.join(ROOT, 'site', 'data.json'))
    ap.add_argument('--delay', type=float, default=0.2, help="pause entre deux téléchargements (s)")
    a = ap.parse_args()

    eff = json.load(open(os.path.join(HERE, 'effectifs.json'), encoding='utf-8'))
    N = {c: eff[c] for c in COHORTS}
    alt_q1 = float(eff.get('QLIO1_part_alternance', 0.3))
    cap = {c: (1 + alt_q1 if c == 'QLIO1' else 1.0) for c in COHORTS}

    finder = fetch(BASE_URL + 'finder.xml') if not a.offline else open(os.path.join(a.cache, 'finder.xml'), 'rb').read()
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)
        if not a.offline:
            open(os.path.join(a.cache, 'finder.xml'), 'wb').write(finder)
    root = ET.fromstring(finder)
    published = ''
    foot = root.findtext('.//footer') or ''
    m = re.search(r'(\d{2}/\d{2}/\d{4} \d{2}:\d{2})', foot)
    if m:
        published = m.group(1)
    groups = [(r.get('id'), r.findtext('name') or '') for r in root.iter('resource') if r.get('type') == 'group']
    names = [n for _, n in groups]
    wanted = [(i, n) for i, n in groups if cohort(n) in COHORTS]
    print(f"{len(groups)} groupes publiés, {len(wanted)} pour la Fleuriaye", file=sys.stderr)

    texts, failed = [], []
    for k, (gid, name) in enumerate(wanted):
        path = os.path.join(a.cache, f'g{gid}.ics') if a.cache else None
        data = None
        if a.offline and path and os.path.exists(path):
            data = open(path, 'rb').read()
        elif not a.offline:
            try:
                data = fetch(BASE_URL + f'g{gid}.ics')
                if path:
                    open(path, 'wb').write(data)
            except Exception as e:  # on continue : un groupe manquant ne bloque pas la page
                failed.append(name)
                print(f"  échec {name}: {e}", file=sys.stderr)
            time.sleep(a.delay)
        if data:
            texts.append(data.decode('utf-8', 'ignore'))
    if len(texts) < 0.9 * len(wanted):
        sys.exit(f"Trop d'échecs de téléchargement ({len(failed)}), data.json non modifié.")

    share = group_shares(names, alt_q1)
    raw = parse_events(texts)

    rooms, types, titles, ri, ti, mi = [], [], [], {}, {}, {}
    def ix(lst, d, v):
        if v not in d:
            d[v] = len(lst); lst.append(v)
        return d[v]

    out = []
    for e in raw:
        typ = e['sum'].split(' - ')[0].strip()
        if typ in EXCLUDED_TYPES:
            continue
        loc = e['loc']
        if loc and not loc.startswith('F-'):
            continue
        if not loc and typ not in ONSITE_WITHOUT_ROOM:
            continue
        gs = [g for g in e['groups'] if cohort(g) in N and g in share]
        if not gs:
            continue
        top = [g for g in gs if not any(h != g and is_child(norm(g), norm(h)) for h in gs)]
        per = collections.defaultdict(float)
        for g in top:
            per[cohort(g)] += share[g]
        cnt = []
        for c, v in per.items():
            n = round(min(cap[c], v) * N[c])
            if n > 0:
                cnt += [COHORTS.index(c), n]
        if not cnt:
            continue
        S = dt.datetime.strptime(e['s'], '%Y%m%dT%H%M%S')
        E = dt.datetime.strptime(e['e'], '%Y%m%dT%H%M%S')
        if S.date() != E.date():
            E = dt.datetime.combine(S.date(), dt.time(20, 0))
        title = (e['mat'] or e['sum'].split(' - ', 1)[-1])[:70]
        out.append([(S.date() - DAY0).days, S.hour * 60 + S.minute, E.hour * 60 + E.minute,
                    ix(rooms, ri, loc.split(' ')[0] if loc else ''), ix(types, ti, typ), ix(titles, mi, title), cnt])
    out.sort(key=lambda r: (r[0], r[1]))

    data = dict(base=DAY0.isoformat(), coh=COHORTS, N=[round(N[c] * cap[c]) for c in COHORTS],
                rooms=rooms, types=types, titles=titles, ev=out, published=published,
                generated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'),
                missing=failed)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"{len(out)} séances écrites dans {a.out} (EDT publiés le {published})", file=sys.stderr)


if __name__ == '__main__':
    main()

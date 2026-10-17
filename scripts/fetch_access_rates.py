"""Electricity-access context for the power-gap maths (KFL-M 1.3, Part C).

Two open sources, both fetched live, nothing typed in by hand:

  1. World Bank WDI (Tracking SDG7 / ESMAP series), CC BY 4.0
       EG.ELC.ACCS.ZS     access to electricity, % of population
       EG.ELC.ACCS.UR.ZS  urban;  EG.ELC.ACCS.RU.ZS rural;  SP.POP.TOTL population
  2. The DHS Program API — Nigeria DHS 2023-24 (NG2024DHS, published 2025-10-15)
       HC_ELEC_P_ELC  population living in a household with electricity, by state
       (and HC_ELEC_H_ELC, households, as a cross-check)

There is no published *rural-by-state* access rate for Nigeria in either source.
The state rural proxy is therefore DERIVED, and labelled as derived:

    state_rural_proxy = state_total_access × (national_rural ÷ national_total)   [NDHS 2024]

i.e. each state is assumed to carry the national rural/total ratio. Where a
state has no NDHS figure, the national rural figure (NDHS 2024) is used and the
row says so.

Output: web/public/data/access_rates.json (bundled by the Worker).

Usage: python3 scripts/fetch_access_rates.py
"""
import datetime as dt
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web/public/data/access_rates.json')
UA = 'Mozilla/5.0 (KaliabeFlareLedger fetch_access_rates; +https://kaliabe-flare-web.pages.dev/data.html)'
WDI = 'https://api.worldbank.org/v2/country/NGA/indicator/{}?format=json&per_page=10&mrv=6'
DHS = 'https://api.dhsprogram.com/rest/dhs/data?indicatorIds={}&surveyIds={}&breakdown=all&f=json&perpage=1000'
SURVEY = 'NG2024DHS'
OIL_STATES = ['Bayelsa', 'Rivers', 'Delta', 'Akwa Ibom', 'Edo', 'Imo', 'Ondo', 'Cross River', 'Abia']
# DHS label → geoBoundaries ADM1 shapeName, where they differ.
NAME_FIX = {'FCT Abuja': 'Federal Capital Territory'}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def wdi(ind):
    d = get(WDI.format(ind))
    rows = [r for r in d[1] if r['value'] is not None]
    return {'indicator': ind, 'label': rows[0]['indicator']['value'], 'lastupdated': d[0].get('lastupdated'),
            'series': {r['date']: r['value'] for r in rows}, 'latest_year': rows[0]['date'], 'latest': rows[0]['value']}


def dhs(ind):
    d = get(DHS.format(ind, SURVEY))['Data']
    nat = {x['CharacteristicLabel']: x['Value'] for x in d if x['CharacteristicCategory'] in ('Total', 'Residence')}
    states = {}
    for x in d:
        lab = x['CharacteristicLabel']
        if x['CharacteristicCategory'] == 'Region' and lab.startswith('..'):
            name = lab[2:].strip()
            states[NAME_FIX.get(name, name)] = x['Value']
    return nat, states


def main():
    w = {k: wdi(k) for k in ['EG.ELC.ACCS.ZS', 'EG.ELC.ACCS.UR.ZS', 'EG.ELC.ACCS.RU.ZS', 'SP.POP.TOTL']}
    nat_p, st_p = dhs('HC_ELEC_P_ELC')
    nat_h, st_h = dhs('HC_ELEC_H_ELC')
    ratio = nat_p['Rural'] / nat_p['Total']
    states = {}
    for name in sorted(set(st_p) | set(st_h)):
        if name in st_p:
            total = st_p[name]
            states[name] = {'access_total_pct': total, 'households_with_electricity_pct': st_h.get(name),
                            'rural_proxy_pct': round(total * ratio, 1),
                            'rural_proxy_basis': f'derived: NDHS 2024 state population-with-electricity {total}% × national rural/total ratio {ratio:.3f}',
                            'oil_producing': name in OIL_STATES}
    yr = w['EG.ELC.ACCS.ZS']['latest_year']
    pop_y = w['SP.POP.TOTL']['series'].get(yr)
    without = round(pop_y * (1 - w['EG.ELC.ACCS.ZS']['latest'] / 100)) if pop_y else None
    out = {
        'meta': {
            'generated': dt.date.today().isoformat(),
            'script': 'scripts/fetch_access_rates.py',
            'sources': [
                {'id': 'wdi-access', 'name': 'World Bank WDI — Access to electricity (Tracking SDG7, ESMAP / IEA / IRENA / UNSD / WHO)',
                 'url': 'https://api.worldbank.org/v2/country/NGA/indicator/EG.ELC.ACCS.ZS', 'licence': 'CC BY 4.0',
                 'vintage': f"WDI last updated {w['EG.ELC.ACCS.ZS']['lastupdated']}; latest data year {yr}"},
                {'id': 'ndhs-2024', 'name': 'Nigeria Demographic and Health Survey 2023-24 (NPC & ICF), via The DHS Program API',
                 'url': DHS.format('HC_ELEC_P_ELC', SURVEY), 'licence': 'DHS Program terms: free public aggregate indicators, cite NPC/ICF',
                 'vintage': 'survey 2023-24, published 2025-10-15'},
            ],
            'rural_proxy_method': ('No published rural-by-state access rate exists in WDI or NDHS. Rural proxy = NDHS 2024 state '
                                   f'population-with-electricity × the national rural/total ratio ({nat_p["Rural"]} ÷ {nat_p["Total"]} = {ratio:.3f}). '
                                   'A state without an NDHS figure falls back to the national NDHS rural figure.'),
            'caveat': ('"With electricity" in NDHS means the household reports an electricity connection or supply; it says nothing '
                       'about hours of supply or reliability, so it overstates usable access. WDI and NDHS differ by method and year.'),
        },
        'national': {
            'wdi': {'year': yr, 'total_pct': w['EG.ELC.ACCS.ZS']['latest'],
                    'urban_pct': w['EG.ELC.ACCS.UR.ZS']['series'].get(yr), 'rural_pct': w['EG.ELC.ACCS.RU.ZS']['series'].get(yr),
                    'series_total': w['EG.ELC.ACCS.ZS']['series'], 'series_urban': w['EG.ELC.ACCS.UR.ZS']['series'],
                    'series_rural': w['EG.ELC.ACCS.RU.ZS']['series'],
                    'population': pop_y, 'people_without_access': without,
                    'people_without_access_basis': f'WDI {yr} population × (1 − WDI {yr} national access)'},
            'ndhs_2024': {'total_pct': nat_p['Total'], 'urban_pct': nat_p['Urban'], 'rural_pct': nat_p['Rural'],
                          'households_total_pct': nat_h['Total'], 'households_urban_pct': nat_h['Urban'], 'households_rural_pct': nat_h['Rural'],
                          'rural_to_total_ratio': round(ratio, 4)},
            'fallback_rural_pct': nat_p['Rural'],
            'fallback_rural_basis': 'NDHS 2024 national rural population-with-electricity',
        },
        'states': states,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(out['national'], indent=1))
    for s in OIL_STATES + ['Kaduna', 'Lagos']:
        print(s, states.get(s))


if __name__ == '__main__':
    main()

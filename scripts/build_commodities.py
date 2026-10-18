#!/usr/bin/env python3
"""KCC 1.0: build data/commodities.json from the seed table below.

Every figure is {value, unit, source, vintage, assumed}. Where a figure is a
band it is {low, central, high, unit, source, vintage, assumed}. Physical
densities are standard engineering reference values (assumed=false, but NOT
re-fetched from a primary source in this build: see verified_in_build).
Truckloads, handling costs and packaging factors are analyst assumptions
(assumed=true): no open Nigerian survey of them was found, so they are
stated as bands and open to challenge. Nothing here is a quote.

    python3 scripts/build_commodities.py
"""
import json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'data', 'commodities.json')

REF = 'standard engineering reference value (bulk/handbook density); not re-fetched from a primary source in this build'
ASSUME_TL = 'KCC analyst assumption: typical Nigerian articulated/tanker payload; no open survey found; challenge welcome'
ASSUME_HD = 'KCC analyst assumption: loading plus offloading cost band; no open Nigerian tariff found'
V = '2026-10 (KCC 1.0)'
PHYS = 'n/a (physical property)'


def fig(value, unit, source, vintage, assumed):
    return {'value': value, 'unit': unit, 'source': source, 'vintage': vintage, 'assumed': assumed}


def band(lo, ce, hi, unit, source, vintage=V, assumed=True):
    return {'low': lo, 'central': ce, 'high': hi, 'unit': unit, 'source': source, 'vintage': vintage, 'assumed': assumed}


# id, name, form, density kg/m3 (lo, hi) or None, unit, unit_mass_kg, unit_label, payload t (lo, ce, hi), handling class, packaging factor, note
ROWS = [
  ('cement_bagged', 'Bagged cement (OPC/PCC)', 'bagged', (1400, 1500), 'bag', 50, '50 kg bag', (25, 30, 36), 'dry_bagged', 'Bagged: manual loading; pallet-free in most yards.', 'Dangote, BUA and Lafarge plants (Obajana, Gboko, Ewekoro, Ibese, Edo) serve most of the market by road.'),
  ('cement_bulk', 'Bulk cement', 'bulk', (1300, 1500), 'tonne', 1000, 'tonne', (28, 32, 36), 'dry_bulk_pneumatic', 'Bulk tanker; pneumatic discharge.', 'Bulk tanker fleets; payload depends on tanker class.'),
  ('clinker', 'Clinker', 'bulk', (1200, 1500), 'tonne', 1000, 'tonne', (28, 32, 36), 'dry_bulk_tipper', 'Tipper or bulk trailer.', 'Intermediate for cement grinding; often moved plant to grinding station.'),
  ('gas_condensate', 'Gas condensate', 'liquid', (700, 780), 'tonne', 1000, 'tonne', (22, 28, 32), 'liquid_flammable', 'Road tanker; dangerous goods.', 'Density band is a typical condensate range; field-specific grades vary.'),
  ('crude_oil', 'Crude oil (road-tanker haul only)', 'liquid', (820, 880), 'drum', 170, '200 L drum (about 170 kg)', (22, 28, 33), 'liquid_flammable', 'Road tanker; dangerous goods.', 'Most crude moves by pipeline and barge. This models only road-tanker haul (for example to modular refineries). Not a pipeline or barge tariff.'),
  ('fertilizer_npk', 'Fertilizer NPK (bagged)', 'bagged', (900, 1100), 'bag', 50, '50 kg bag', (25, 30, 35), 'dry_bagged', 'Bagged 50 kg.', 'Seasonal peaks around planting.'),
  ('fertilizer_urea', 'Fertilizer urea (bagged)', 'bagged', (700, 800), 'bag', 50, '50 kg bag', (25, 30, 35), 'dry_bagged', 'Bagged 50 kg.', 'Dangote and Indorama urea ex Port Harcourt/Onne area.'),
  ('palm_oil', 'Palm oil (crude, bulk)', 'liquid', (890, 920), 'drum', 190, '200 L drum (about 190 kg)', (18, 24, 30), 'liquid_edible', 'Food-grade tanker or drums.', 'Drum loads have a lower payload than tankers.'),
  ('soya', 'Soya beans', 'bagged', (720, 780), 'bag', 100, '100 kg bag', (25, 30, 36), 'grain_bagged', 'Bagged grain; manual loading.', 'Northern origin; moves south to feed mills.'),
  ('rice', 'Rice (milled, bagged)', 'bagged', (750, 850), 'bag', 50, '50 kg bag', (25, 30, 36), 'grain_bagged', 'Bagged grain; manual loading.', 'Milled rice; paddy has a different density and is not modelled.'),
  ('maize', 'Maize (grain, bagged)', 'bagged', (700, 780), 'bag', 100, '100 kg bag', (25, 30, 36), 'grain_bagged', 'Bagged grain; manual loading.', 'Northern origin; seasonal.'),
  ('steel_rebar', 'Steel rebar', 'breakbulk', (7800, 7900), 'tonne', 1000, 'tonne', (25, 30, 35), 'breakbulk_steel', 'Flatbed; crane or forklift.', 'Volume is not the limit, axle weight is; density is shown for completeness.'),
  ('fuel_ago', 'Fuel: diesel/AGO (road tanker)', 'liquid', (820, 860), 'litre', 0.84, 'litre (about 0.84 kg)', (28, 33, 37), 'liquid_flammable', 'Tanker (33 to 45 kL); dangerous goods.', 'Depot to filling station and depot to site.'),
]

# handling class -> USD/tonne (lo, ce, hi) loading + offloading, and vehicle factor (lo, ce, hi)
CLASSES = {
  'dry_bagged':         ((1.5, 3.0, 5.0), (1.00, 1.00, 1.00)),
  'dry_bulk_pneumatic': ((0.8, 1.5, 3.0), (1.00, 1.10, 1.25)),
  'dry_bulk_tipper':    ((0.8, 1.5, 3.0), (0.95, 1.00, 1.10)),
  'liquid_flammable':   ((0.8, 1.5, 3.5), (1.05, 1.15, 1.35)),
  'liquid_edible':      ((1.0, 2.0, 4.0), (1.00, 1.10, 1.25)),
  'grain_bagged':       ((1.5, 3.0, 5.0), (1.00, 1.00, 1.00)),
  'breakbulk_steel':    ((2.0, 4.0, 7.0), (0.95, 1.00, 1.10)),
}

out = {
  'schema': 'kcc-commodities/1',
  'version': 'KCC 1.0',
  'generated_by': 'scripts/build_commodities.py',
  'licence': 'MIT (code and table); each figure carries its own source pointer',
  'verified_in_build': False,
  'honesty': 'Every figure is an ESTIMATE. assumed=false marks a standard reference value that was not re-fetched in this build; assumed=true marks a KCC analyst assumption with no open survey behind it. Nothing here is a quote.',
  'handling_classes': {},
  'commodities': [],
}
for cid, (hd, vf) in CLASSES.items():
    out['handling_classes'][cid] = {
      'handling_usd_per_tonne': band(*hd, 'USD/tonne', ASSUME_HD),
      'vehicle_factor': band(*vf, 'multiplier on truck-km rate', 'KCC analyst assumption: tanker/pneumatic bodies cost more per km than a flatbed; no open source'),
    }
for cid, name, form, dens, unit, umass, ulabel, pay, hclass, pack, note in ROWS:
    out['commodities'].append({
      'id': cid, 'name': name, 'form': form,
      'density_kg_m3': band(dens[0], round((dens[0] + dens[1]) / 2), dens[1], 'kg/m3', REF, PHYS, False),
      'typical_unit': {'unit': unit, 'unit_mass_kg': fig(umass, 'kg per unit', 'Trade convention for this unit (bag/drum/litre/tonne)', 'n/a (convention)', False), 'label': ulabel},
      'typical_truckload_t': band(*pay, 'tonnes per truck', ASSUME_TL),
      'truck_type': 'articulated 30 to 40 t class (about 20 ft container equivalent) unless a tanker class is noted',
      'handling_class': hclass,
      'handling_note': pack,
      'note': note,
    })
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('wrote', os.path.relpath(OUT, ROOT), len(out['commodities']), 'commodities')

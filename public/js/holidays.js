// holidays.js — static list of Australian public holidays (2026 and 2027).
// Best-effort, compiled from the state/territory gazettes as known at build
// time. Dates marked "provisional" depend on annual proclamation (WA King's
// Birthday, Victoria's AFL Grand Final eve). Region-only holidays such as
// show days and part-day holidays are not included. Any day can be overridden
// by giving it an explicit record (e.g. type Work) in the app.

export const REGIONS = [
  { code: 'none', name: 'None — do not pre-mark public holidays' },
  { code: 'ACT', name: 'Australian Capital Territory' },
  { code: 'NSW', name: 'New South Wales' },
  { code: 'NT', name: 'Northern Territory' },
  { code: 'QLD', name: 'Queensland' },
  { code: 'SA', name: 'South Australia' },
  { code: 'TAS', name: 'Tasmania' },
  { code: 'VIC', name: 'Victoria' },
  { code: 'WA', name: 'Western Australia' },
];

export const HOLIDAY_YEARS = [2026, 2027];

const NATIONAL = [
  ['2026-01-01', "New Year's Day"],
  ['2026-01-26', 'Australia Day'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-06', 'Easter Monday'],
  ['2026-04-25', 'Anzac Day'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2026-12-28', 'Boxing Day (substitute)'],
  ['2027-01-01', "New Year's Day"],
  ['2027-01-26', 'Australia Day'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-04-25', 'Anzac Day'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Boxing Day'],
  ['2027-12-27', 'Christmas Day (substitute)'],
  ['2027-12-28', 'Boxing Day (substitute)'],
];

const REGIONAL = {
  ACT: [
    ['2026-03-09', 'Canberra Day'],
    ['2026-04-04', 'Easter Saturday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-06-01', 'Reconciliation Day'],
    ['2026-06-08', "King's Birthday"],
    ['2026-10-05', 'Labour Day'],
    ['2027-03-08', 'Canberra Day'],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-04-26', 'Anzac Day (substitute)'],
    ['2027-05-31', 'Reconciliation Day'],
    ['2027-06-14', "King's Birthday"],
    ['2027-10-04', 'Labour Day'],
  ],
  NSW: [
    ['2026-04-04', 'Easter Saturday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-06-08', "King's Birthday"],
    ['2026-10-05', 'Labour Day'],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-06-14', "King's Birthday"],
    ['2027-10-04', 'Labour Day'],
  ],
  NT: [
    ['2026-04-04', 'Easter Saturday'],
    ['2026-05-04', 'May Day'],
    ['2026-06-08', "King's Birthday"],
    ['2026-08-03', 'Picnic Day'],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-04-26', 'Anzac Day (substitute)'],
    ['2027-05-03', 'May Day'],
    ['2027-06-14', "King's Birthday"],
    ['2027-08-02', 'Picnic Day'],
  ],
  QLD: [
    ['2026-04-04', 'Easter Saturday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-05-04', 'Labour Day'],
    ['2026-10-05', "King's Birthday"],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-04-26', 'Anzac Day (substitute)'],
    ['2027-05-03', 'Labour Day'],
    ['2027-10-04', "King's Birthday"],
  ],
  SA: [
    ['2026-03-09', 'Adelaide Cup Day'],
    ['2026-04-04', 'Easter Saturday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-06-08', "King's Birthday"],
    ['2026-10-05', 'Labour Day'],
    ['2027-03-08', 'Adelaide Cup Day'],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-04-26', 'Anzac Day (substitute)'],
    ['2027-06-14', "King's Birthday"],
    ['2027-10-04', 'Labour Day'],
  ],
  TAS: [
    ['2026-03-09', 'Eight Hours Day'],
    ['2026-06-08', "King's Birthday"],
    ['2027-03-08', 'Eight Hours Day'],
    ['2027-06-14', "King's Birthday"],
  ],
  VIC: [
    ['2026-03-09', 'Labour Day'],
    ['2026-04-04', 'Easter Saturday'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-06-08', "King's Birthday"],
    ['2026-09-25', 'Friday before the AFL Grand Final (provisional)'],
    ['2026-11-03', 'Melbourne Cup Day'],
    ['2027-03-08', 'Labour Day'],
    ['2027-03-27', 'Easter Saturday'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-06-14', "King's Birthday"],
    ['2027-09-24', 'Friday before the AFL Grand Final (provisional)'],
    ['2027-11-02', 'Melbourne Cup Day'],
  ],
  WA: [
    ['2026-03-02', 'Labour Day'],
    ['2026-04-05', 'Easter Sunday'],
    ['2026-04-27', 'Anzac Day (substitute)'],
    ['2026-06-01', 'Western Australia Day'],
    ['2026-09-28', "King's Birthday (provisional)"],
    ['2027-03-01', 'Labour Day'],
    ['2027-03-28', 'Easter Sunday'],
    ['2027-04-26', 'Anzac Day (substitute)'],
    ['2027-06-07', 'Western Australia Day'],
    ['2027-09-27', "King's Birthday (provisional)"],
  ],
};

const cache = new Map();

/** Map of ISO date → holiday name for a region code ('none' → empty map). */
export function holidayMap(region) {
  const code = REGIONAL[region] ? region : 'none';
  if (cache.has(code)) return cache.get(code);
  const map = new Map();
  if (code !== 'none') {
    for (const [d, n] of NATIONAL) map.set(d, n);
    for (const [d, n] of REGIONAL[code]) map.set(d, n);
  }
  cache.set(code, map);
  return map;
}

export function isKnownRegion(region) {
  return region === 'none' || Boolean(REGIONAL[region]);
}

/** All holidays for a region as a sorted array of [iso, name]. */
export function holidayList(region) {
  return [...holidayMap(region).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// holidays.js — Australian public holidays for 2026 and 2027, per jurisdiction.
//
// Source: Fair Work Ombudsman, "2026 public holidays" and "2027 public holidays"
// (https://www.fairwork.gov.au/employment-conditions/public-holidays), which
// reproduce each state and territory government's gazetted lists. Fetched
// 6 September 2026; Fair Work's own "content last updated" stamps were
// 2026-08-07 (2026 page) and 2026-08-31 (2027 page).
//
// Each list below is the complete Fair Work list for that jurisdiction except
// for these deliberate omissions, which the user can add by hand in Settings:
//   - part-day holidays (Christmas Eve / New Year's Eve evenings in NT, QLD, SA)
//   - holidays limited to an area or workforce: Royal Queensland Show (Brisbane
//     only); Royal Hobart Regatta, Royal Hobart Show and Recreation Day (parts
//     of Tasmania); Easter Tuesday (Tasmanian public service)
//   - Victoria's Friday before the AFL Grand Final 2027 (Fair Work: date TBC)
// The NSW Bank Holiday is not a public holiday for most workers and is not
// listed by Fair Work.
//
// These lists are only defaults: picking a jurisdiction copies them into the
// timesheet file's "Public holidays" table, where every entry can be moved,
// renamed or removed, and any listed day is overridden by giving it a record.

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

const NYD = "New Year's Day";
const AUS = 'Australia Day';
const GF = 'Good Friday';
const ES = 'Easter Saturday';
const ESUN = 'Easter Sunday';
const EM = 'Easter Monday';
const ANZAC = 'Anzac Day';
const ANZAC_ADD = 'Anzac Day (additional day)';
const KB = "King's Birthday";
const XMAS = 'Christmas Day';
const XMAS_ADD = 'Christmas Day (additional day)';
const BOX = 'Boxing Day';
const BOX_ADD = 'Boxing Day (additional day)';

const LISTS = {
  ACT: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-03-09', 'Canberra Day'], ['2026-04-03', GF], ['2026-04-04', ES], ['2026-04-05', ESUN],
    ['2026-04-06', EM], ['2026-04-25', ANZAC], ['2026-04-27', ANZAC_ADD], ['2026-06-01', 'Reconciliation Day'], ['2026-06-08', KB],
    ['2026-10-05', 'Labour Day'], ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-08', 'Canberra Day'], ['2027-03-26', GF], ['2027-03-27', ES], ['2027-03-28', ESUN],
    ['2027-03-29', EM], ['2027-04-25', ANZAC], ['2027-04-26', ANZAC_ADD], ['2027-05-31', 'Reconciliation Day'], ['2027-06-14', KB],
    ['2027-10-04', 'Labour Day'], ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
  NSW: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-04-03', GF], ['2026-04-04', ES], ['2026-04-05', ESUN], ['2026-04-06', EM],
    ['2026-04-25', ANZAC], ['2026-04-27', ANZAC_ADD], ['2026-06-08', KB], ['2026-10-05', 'Labour Day'],
    ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-26', GF], ['2027-03-27', ES], ['2027-03-28', ESUN], ['2027-03-29', EM],
    ['2027-04-25', ANZAC], ['2027-04-26', ANZAC_ADD], ['2027-06-14', KB], ['2027-10-04', 'Labour Day'],
    ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
  NT: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-04-03', GF], ['2026-04-04', ES], ['2026-04-05', ESUN], ['2026-04-06', EM],
    ['2026-04-25', ANZAC], ['2026-05-04', 'May Day'], ['2026-06-08', KB], ['2026-08-03', 'Picnic Day'],
    ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-26', GF], ['2027-03-27', ES], ['2027-03-28', ESUN], ['2027-03-29', EM],
    ['2027-04-26', ANZAC], ['2027-05-03', 'May Day'], ['2027-06-14', KB], ['2027-08-02', 'Picnic Day'],
    ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
  QLD: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-04-03', GF], ['2026-04-04', 'The day after Good Friday'], ['2026-04-05', ESUN], ['2026-04-06', EM],
    ['2026-04-25', ANZAC], ['2026-05-04', 'Labour Day'], ['2026-10-05', KB],
    ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-26', GF], ['2027-03-27', 'The day after Good Friday'], ['2027-03-28', ESUN], ['2027-03-29', EM],
    ['2027-04-26', ANZAC], ['2027-05-03', 'Labour Day'], ['2027-10-04', KB],
    ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
  SA: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-03-09', 'Adelaide Cup Day'], ['2026-04-03', GF], ['2026-04-04', ES], ['2026-04-05', ESUN],
    ['2026-04-06', EM], ['2026-04-25', ANZAC], ['2026-06-08', KB], ['2026-10-05', 'Labour Day'],
    ['2026-12-25', XMAS], ['2026-12-26', 'Proclamation Day holiday'], ['2026-12-28', 'Proclamation Day holiday (additional day)'],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-08', 'Adelaide Cup Day'], ['2027-03-26', GF], ['2027-03-27', ES], ['2027-03-28', ESUN],
    ['2027-03-29', EM], ['2027-04-25', ANZAC], ['2027-06-14', KB], ['2027-10-04', 'Labour Day'],
    ['2027-12-25', XMAS], ['2027-12-26', 'Proclamation Day holiday'], ['2027-12-27', XMAS_ADD], ['2027-12-28', 'Proclamation Day holiday (additional day)'],
  ],
  TAS: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-03-09', 'Eight Hours Day'], ['2026-04-03', GF], ['2026-04-06', EM],
    ['2026-04-25', ANZAC], ['2026-06-08', KB], ['2026-12-25', XMAS], ['2026-12-28', BOX],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-08', 'Eight Hours Day'], ['2027-03-26', GF], ['2027-03-29', EM],
    ['2027-04-25', ANZAC], ['2027-06-14', KB], ['2027-12-25', XMAS], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX],
  ],
  VIC: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-03-09', 'Labour Day'], ['2026-04-03', GF], ['2026-04-04', 'Saturday before Easter Sunday'], ['2026-04-05', ESUN],
    ['2026-04-06', EM], ['2026-04-25', ANZAC], ['2026-06-08', KB], ['2026-09-25', 'Friday before the AFL Grand Final'], ['2026-11-03', 'Melbourne Cup'],
    ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-08', 'Labour Day'], ['2027-03-26', GF], ['2027-03-27', 'Saturday before Easter Sunday'], ['2027-03-28', ESUN],
    ['2027-03-29', EM], ['2027-04-25', ANZAC], ['2027-06-14', KB], ['2027-11-02', 'Melbourne Cup'],
    ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
  WA: [
    ['2026-01-01', NYD], ['2026-01-26', AUS], ['2026-03-02', 'Labour Day'], ['2026-04-03', GF], ['2026-04-05', ESUN], ['2026-04-06', EM],
    ['2026-04-25', ANZAC], ['2026-04-27', ANZAC_ADD], ['2026-06-01', 'Western Australia Day'], ['2026-09-28', KB],
    ['2026-12-25', XMAS], ['2026-12-26', BOX], ['2026-12-28', BOX_ADD],
    ['2027-01-01', NYD], ['2027-01-26', AUS], ['2027-03-01', 'Labour Day'], ['2027-03-26', GF], ['2027-03-28', ESUN], ['2027-03-29', EM],
    ['2027-04-25', ANZAC], ['2027-04-26', ANZAC_ADD], ['2027-06-07', 'Western Australia Day'], ['2027-09-27', KB],
    ['2027-12-25', XMAS], ['2027-12-26', BOX], ['2027-12-27', XMAS_ADD], ['2027-12-28', BOX_ADD],
  ],
};

const cache = new Map();

/** Map of ISO date → holiday name for a region code ('none' or unknown → empty map). */
export function holidayMap(region) {
  const code = LISTS[region] ? region : 'none';
  if (cache.has(code)) return cache.get(code);
  const map = new Map();
  if (code !== 'none') for (const [d, n] of LISTS[code]) map.set(d, n);
  cache.set(code, map);
  return map;
}

export function isKnownRegion(region) {
  return region === 'none' || Boolean(LISTS[region]);
}

/** All holidays for a region as a sorted array of [iso, name]. */
export function holidayList(region) {
  return [...holidayMap(region).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** All holidays for a region as { date, name } entries, ready for the file's Public holidays table. */
export function regionHolidays(region) {
  return holidayList(region).map(([date, name]) => ({ date, name }));
}

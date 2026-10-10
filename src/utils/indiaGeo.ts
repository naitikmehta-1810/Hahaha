/**
 * A small, self-contained map of India for the "hometown" pin on a maker's
 * profile. No map tiles, no third-party scripts: the outline is a coarse
 * polygon projected to SVG, and the pin is placed from a built-in table of
 * cities with the state's centre as the fallback.
 *
 * Outline, state centres and cities are approximate by design (a maker's
 * hometown, not a survey). Coordinates are [longitude, latitude].
 */

type LonLat = readonly [number, number];

/** Mainland outline, clockwise from the north-west. */
const MAINLAND: LonLat[] = [
  [74.3, 36.9], [75.6, 36.9], [76.7, 35.9], [77.8, 35.5], [78.9, 35.6], [80.2, 35.4],
  [80.3, 34.3], [79.7, 33.2], [79.2, 32.5], [78.7, 31.9], [78.7, 31.0], [79.1, 30.6],
  [80.2, 30.3], [81.0, 30.2], [80.5, 29.7], [80.2, 28.9], [80.6, 28.6], [81.4, 28.2],
  [82.0, 27.9], [83.3, 27.4], [84.7, 27.0], [85.8, 26.6], [87.2, 26.4], [88.1, 26.4],
  [88.0, 27.0], [88.2, 27.8], [88.8, 28.0], [88.9, 27.3], [88.7, 26.9], [89.6, 26.7],
  [90.8, 26.8], [91.8, 26.8], [92.0, 27.5], [92.7, 28.3], [93.8, 28.7], [95.0, 29.2],
  [96.2, 29.0], [97.3, 28.2], [96.9, 27.5], [96.1, 27.3], [95.3, 26.9], [95.0, 26.0],
  [94.6, 25.3], [94.3, 24.3], [94.7, 23.4], [94.2, 22.9], [93.4, 22.7], [93.1, 22.0],
  [92.6, 22.2], [92.3, 23.2], [91.8, 23.0], [91.3, 23.1], [91.5, 24.1], [92.2, 24.4],
  [91.9, 25.1], [91.0, 25.1], [90.1, 25.2], [89.8, 25.4], [89.9, 26.0], [89.0, 26.3],
  [88.4, 26.5], [88.2, 25.8], [88.5, 25.2], [88.1, 24.7], [88.7, 24.2], [88.4, 23.7],
  [88.9, 23.2], [89.0, 22.3], [88.9, 21.7], [88.2, 21.6], [87.0, 21.5], [86.9, 21.0],
  [86.5, 20.2], [85.9, 19.8], [85.0, 19.3], [84.1, 18.4], [83.3, 17.7], [82.3, 16.9],
  [81.3, 16.3], [80.3, 15.7], [80.1, 14.9], [80.3, 13.1], [79.9, 11.9], [79.85, 10.8],
  [79.3, 10.3], [79.3, 9.3], [78.2, 8.9], [77.55, 8.08], [76.95, 8.5], [76.2, 9.9],
  [75.8, 11.2], [75.0, 12.5], [74.7, 13.4], [74.1, 14.8], [73.8, 15.5], [73.3, 17.0],
  [72.8, 18.9], [72.8, 20.0], [72.7, 21.1], [72.6, 21.7], [72.2, 22.2], [72.2, 21.7],
  [71.0, 20.7], [70.0, 21.1], [69.6, 21.6], [69.0, 22.2], [70.0, 22.8], [69.0, 22.9],
  [68.2, 23.6], [68.8, 24.3], [69.5, 24.2], [70.1, 24.4], [70.6, 25.4], [70.2, 26.2],
  [70.5, 27.1], [69.6, 27.3], [70.2, 28.0], [71.9, 28.0], [72.7, 28.9], [73.4, 29.9],
  [74.5, 31.0], [74.8, 31.7], [75.3, 32.2], [74.6, 32.7], [74.0, 33.1], [73.6, 34.0],
  [73.0, 34.7], [72.7, 35.5], [73.3, 36.5],
];

/** Island groups, drawn as small separate shapes. */
const ISLANDS: LonLat[][] = [
  // Andaman
  [[92.7, 13.4], [93.0, 13.5], [92.9, 12.5], [92.8, 11.6], [93.1, 11.1], [92.7, 11.5], [92.6, 12.3]],
  [[92.9, 10.9], [93.1, 10.8], [93.0, 10.2], [92.8, 10.5]],
  // Nicobar
  [[93.5, 8.2], [93.9, 7.3], [93.7, 7.0], [93.4, 7.4]],
  [[93.6, 9.3], [93.8, 9.2], [93.7, 9.0], [93.5, 9.1]],
  // Lakshadweep
  [[72.6, 10.6], [72.7, 10.5], [72.6, 10.5]],
  [[73.0, 8.3], [73.1, 8.2], [73.0, 8.2]],
  [[72.2, 11.2], [72.3, 11.1], [72.2, 11.1]],
];

const LON_MIN = 67.8;
const LON_MAX = 97.8;
const LAT_MIN = 6.4;
const LAT_MAX = 37.2;
/** Longitude degrees are shorter than latitude degrees at India's latitudes. */
const LON_SCALE = 0.92;
const SCALE = 18;

export const MAP_WIDTH = Math.round((LON_MAX - LON_MIN) * LON_SCALE * SCALE);
export const MAP_HEIGHT = Math.round((LAT_MAX - LAT_MIN) * SCALE);

export function project(lon: number, lat: number): { x: number; y: number } {
  return {
    x: Math.round((lon - LON_MIN) * LON_SCALE * SCALE * 10) / 10,
    y: Math.round((LAT_MAX - lat) * SCALE * 10) / 10,
  };
}

function polygonPath(points: LonLat[]) {
  return (
    points
      .map(([lon, lat], index) => {
        const { x, y } = project(lon, lat);
        return `${index === 0 ? "M" : "L"}${x} ${y}`;
      })
      .join(" ") + " Z"
  );
}

/** SVG path data for the country shape (mainland and islands). */
export const INDIA_OUTLINE_PATH = [MAINLAND, ...ISLANDS].map(polygonPath).join(" ");

/** State and union territory centres, keyed by the canonical names the API uses. */
const STATE_CENTRES: Record<string, LonLat> = {
  "Andaman and Nicobar Islands": [92.8, 11.7],
  "Andhra Pradesh": [79.7, 15.9],
  "Arunachal Pradesh": [94.7, 28.2],
  Assam: [92.9, 26.2],
  Bihar: [85.3, 25.6],
  Chandigarh: [76.78, 30.73],
  Chhattisgarh: [81.9, 21.3],
  "Dadra and Nagar Haveli and Daman and Diu": [73.0, 20.3],
  Delhi: [77.1, 28.65],
  Goa: [74.0, 15.35],
  Gujarat: [71.6, 22.7],
  Haryana: [76.1, 29.1],
  "Himachal Pradesh": [77.2, 31.9],
  "Jammu and Kashmir": [75.0, 33.6],
  Jharkhand: [85.4, 23.7],
  Karnataka: [76.1, 14.8],
  Kerala: [76.5, 10.3],
  Ladakh: [77.6, 34.4],
  Lakshadweep: [72.7, 10.6],
  "Madhya Pradesh": [78.3, 23.5],
  Maharashtra: [75.7, 19.4],
  Manipur: [93.9, 24.7],
  Meghalaya: [91.3, 25.5],
  Mizoram: [92.8, 23.3],
  Nagaland: [94.4, 26.1],
  Odisha: [84.4, 20.5],
  Puducherry: [79.8, 11.9],
  Punjab: [75.4, 31.0],
  Rajasthan: [74.2, 26.6],
  Sikkim: [88.5, 27.55],
  "Tamil Nadu": [78.4, 11.0],
  Telangana: [79.1, 17.9],
  Tripura: [91.7, 23.8],
  "Uttar Pradesh": [80.8, 26.9],
  Uttarakhand: [79.1, 30.1],
  "West Bengal": [87.9, 23.2],
};

/** Cities makers are likely to call home: [latitude, longitude]. */
const CITIES: Record<string, readonly [number, number]> = {
  delhi: [28.61, 77.21], newdelhi: [28.61, 77.21], mumbai: [19.08, 72.88], kolkata: [22.57, 88.36],
  chennai: [13.08, 80.27], bengaluru: [12.97, 77.59], hyderabad: [17.39, 78.49], ahmedabad: [23.02, 72.57],
  pune: [18.52, 73.86], jaipur: [26.91, 75.79], lucknow: [26.85, 80.95], kanpur: [26.45, 80.35],
  nagpur: [21.15, 79.09], indore: [22.72, 75.86], bhopal: [23.26, 77.41], patna: [25.59, 85.14],
  vadodara: [22.31, 73.18], surat: [21.17, 72.83], visakhapatnam: [17.69, 83.22], coimbatore: [11.0, 76.96],
  kochi: [9.93, 76.27], thiruvananthapuram: [8.52, 76.94], kozhikode: [11.26, 75.78], madurai: [9.93, 78.12],
  mysuru: [12.3, 76.64], mangaluru: [12.91, 74.86], panaji: [15.5, 73.83], goa: [15.4, 73.9],
  chandigarh: [30.73, 76.78], amritsar: [31.63, 74.87], ludhiana: [30.9, 75.86], jalandhar: [31.33, 75.58],
  dehradun: [30.32, 78.03], haridwar: [29.95, 78.16], rishikesh: [30.09, 78.27], shimla: [31.1, 77.17],
  manali: [32.24, 77.19], srinagar: [34.08, 74.8], jammu: [32.73, 74.86], leh: [34.15, 77.58],
  varanasi: [25.32, 83.0], prayagraj: [25.44, 81.85], agra: [27.18, 78.01], mathura: [27.49, 77.67],
  meerut: [28.98, 77.71], noida: [28.54, 77.39], gurugram: [28.46, 77.03], faridabad: [28.41, 77.31],
  ghaziabad: [28.67, 77.45], jodhpur: [26.24, 73.02], udaipur: [24.58, 73.71], jaisalmer: [26.92, 70.91],
  bikaner: [28.02, 73.31], ajmer: [26.45, 74.64], pushkar: [26.49, 74.55], kota: [25.21, 75.86],
  rajkot: [22.3, 70.8], bhuj: [23.25, 69.67], gandhinagar: [23.22, 72.65], raipur: [21.25, 81.63],
  ranchi: [23.34, 85.31], jamshedpur: [22.8, 86.2], bhubaneswar: [20.3, 85.82], cuttack: [20.46, 85.88],
  puri: [19.81, 85.83], guwahati: [26.14, 91.74], shillong: [25.57, 91.88], imphal: [24.82, 93.94],
  aizawl: [23.73, 92.72], kohima: [25.67, 94.11], agartala: [23.83, 91.28], itanagar: [27.08, 93.61],
  gangtok: [27.33, 88.61], darjeeling: [27.04, 88.26], siliguri: [26.73, 88.4], nashik: [19.99, 73.79],
  aurangabad: [19.88, 75.34], kolhapur: [16.7, 74.24], solapur: [17.66, 75.91], thane: [19.22, 72.98],
  vijayawada: [16.51, 80.65], guntur: [16.31, 80.44], tirupati: [13.63, 79.42], warangal: [17.97, 79.59],
  salem: [11.66, 78.15], tiruchirappalli: [10.79, 78.7], thanjavur: [10.79, 79.14], puducherry: [11.94, 79.81],
  hubballi: [15.36, 75.12], belagavi: [15.85, 74.5], udupi: [13.34, 74.75], alappuzha: [9.49, 76.34],
  thrissur: [10.53, 76.21], kannur: [11.87, 75.37], ujjain: [23.18, 75.78], gwalior: [26.22, 78.18],
  jabalpur: [23.18, 79.95], jhansi: [25.45, 78.57], gorakhpur: [26.76, 83.37], bareilly: [28.35, 79.43],
  moradabad: [28.84, 78.78], aligarh: [27.88, 78.08], saharanpur: [29.96, 77.55], muzaffarpur: [26.12, 85.39],
  gaya: [24.8, 85.0], bhagalpur: [25.24, 87.0], dhanbad: [23.8, 86.43], durgapur: [23.55, 87.32],
  howrah: [22.59, 88.26], portblair: [11.62, 92.73], kavaratti: [10.57, 72.64], silvassa: [20.27, 73.0],
  daman: [20.41, 72.83], panipat: [29.39, 76.97], ambala: [30.38, 76.78], karnal: [29.69, 76.99],
  rohtak: [28.89, 76.57], hisar: [29.15, 75.72], sonipat: [28.99, 77.02], bhilai: [21.21, 81.38],
  bilaspur: [22.08, 82.15], mountabu: [24.59, 72.71], kutch: [23.73, 69.86], bhavnagar: [21.76, 72.15],
  jamnagar: [22.47, 70.07], pondicherry: [11.94, 79.81],
};

const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru", bombay: "mumbai", calcutta: "kolkata", madras: "chennai",
  mysore: "mysuru", gurgaon: "gurugram", allahabad: "prayagraj", trivandrum: "thiruvananthapuram",
  cochin: "kochi", calicut: "kozhikode", benaras: "varanasi", banaras: "varanasi",
  baroda: "vadodara", trichy: "tiruchirappalli", vizag: "visakhapatnam", poona: "pune",
  panjim: "panaji", mangalore: "mangaluru", belgaum: "belagavi", hubli: "hubballi",
  orissa: "odisha", navimumbai: "mumbai",
};

const squash = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

/** Where to put the pin for a hometown, or null when neither city nor state is known. */
export function hometownPoint(
  city: string | null | undefined,
  state: string | null | undefined
): { x: number; y: number; precise: boolean } | null {
  const key = squash(city ?? "");
  const cityKey = CITY_ALIASES[key] ?? key;
  const known = cityKey ? CITIES[cityKey] : undefined;
  if (known) {
    const { x, y } = project(known[1], known[0]);
    return { x, y, precise: true };
  }
  const centre = state ? STATE_CENTRES[state] : undefined;
  if (centre) {
    const { x, y } = project(centre[0], centre[1]);
    return { x, y, precise: false };
  }
  return null;
}

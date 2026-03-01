/** Maps Singapore towns to high-level regions for neighbourhood visualizations. */

const REGION_MAP: Record<string, string> = {
  BISHAN: "Central",
  "BUKIT MERAH": "Central",
  "BUKIT TIMAH": "Central",
  "CENTRAL AREA": "Central",
  GEYLANG: "Central",
  "KALLANG/WHAMPOA": "Central",
  "MARINE PARADE": "Central",
  QUEENSTOWN: "Central",
  "TOA PAYOH": "Central",
  BEDOK: "East",
  "PASIR RIS": "East",
  TAMPINES: "East",
  SEMBAWANG: "North",
  WOODLANDS: "North",
  YISHUN: "North",
  "ANG MO KIO": "North-East",
  HOUGANG: "North-East",
  PUNGGOL: "North-East",
  SENGKANG: "North-East",
  SERANGOON: "North-East",
  "BUKIT BATOK": "West",
  "BUKIT PANJANG": "West",
  "CHOA CHU KANG": "West",
  CLEMENTI: "West",
  "JURONG EAST": "West",
  "JURONG WEST": "West",
};

export function getRegionForTown(town: string): string {
  return REGION_MAP[town.toUpperCase()] ?? "Unknown";
}

export const REGIONS = ["Central", "North", "North-East", "East", "West"] as const;

/**
 * Maps HDB town names to GeoJSON planning area names.
 * Most are 1:1 direct matches; only mismatches are listed.
 */
export const TOWN_TO_PLANNING_AREA: Record<string, string[]> = {
  "KALLANG/WHAMPOA": ["KALLANG"],
  "CENTRAL AREA": [
    "DOWNTOWN CORE", "OUTRAM", "ROCHOR", "MUSEUM",
    "SINGAPORE RIVER", "MARINA EAST", "MARINA SOUTH",
    "RIVER VALLEY", "ORCHARD", "NEWTON", "STRAITS VIEW",
  ],
};

/**
 * Maps URA postal districts D01–D28 to planning area names.
 * Used to color the choropleth map for the Private Districts tab.
 */
export const DISTRICT_TO_PLANNING_AREAS: Record<string, string[]> = {
  "01": ["DOWNTOWN CORE", "MARINA SOUTH"],
  "02": ["OUTRAM", "DOWNTOWN CORE"],
  "03": ["QUEENSTOWN", "BUKIT MERAH"],
  "04": ["BUKIT MERAH"],
  "05": ["CLEMENTI", "QUEENSTOWN"],
  "06": ["ROCHOR", "MUSEUM", "SINGAPORE RIVER"],
  "07": ["ROCHOR", "KALLANG"],
  "08": ["ROCHOR", "NOVENA"],
  "09": ["ORCHARD", "RIVER VALLEY", "NEWTON"],
  "10": ["TANGLIN", "BUKIT TIMAH"],
  "11": ["NOVENA", "BUKIT TIMAH", "NEWTON"],
  "12": ["TOA PAYOH", "NOVENA"],
  "13": ["TOA PAYOH", "GEYLANG", "KALLANG"],
  "14": ["GEYLANG", "PAYA LEBAR"],
  "15": ["MARINE PARADE", "GEYLANG"],
  "16": ["BEDOK"],
  "17": ["CHANGI", "PASIR RIS"],
  "18": ["TAMPINES", "PASIR RIS"],
  "19": ["SERANGOON", "HOUGANG", "PUNGGOL", "SENGKANG"],
  "20": ["BISHAN", "ANG MO KIO"],
  "21": ["BUKIT TIMAH", "CLEMENTI", "BUKIT BATOK"],
  "22": ["JURONG EAST", "JURONG WEST", "BOON LAY"],
  "23": ["BUKIT PANJANG", "CHOA CHU KANG", "BUKIT BATOK"],
  "24": ["LIM CHU KANG", "TENGAH", "CHOA CHU KANG"],
  "25": ["WOODLANDS", "SUNGEI KADUT"],
  "26": ["BISHAN", "ANG MO KIO", "MANDAI"],
  "27": ["YISHUN", "SEMBAWANG"],
  "28": ["SELETAR", "ANG MO KIO"],
};

/** District display names for the ranked list. */
export const DISTRICT_LABELS: Record<string, string> = {
  "01": "Raffles Place, Cecil, Marina",
  "02": "Anson, Tanjong Pagar",
  "03": "Queenstown, Tiong Bahru",
  "04": "Telok Blangah, Harbourfront",
  "05": "Pasir Panjang, Clementi",
  "06": "High Street, Beach Road",
  "07": "Middle Road, Golden Mile",
  "08": "Little India",
  "09": "Orchard, Cairnhill, River Valley",
  "10": "Ardmore, Bukit Timah, Holland",
  "11": "Watten Estate, Novena, Thomson",
  "12": "Balestier, Toa Payoh, Serangoon",
  "13": "Macpherson, Braddell",
  "14": "Geylang, Eunos",
  "15": "Katong, Joo Chiat, Amber Road",
  "16": "Bedok, Upper East Coast",
  "17": "Loyang, Changi",
  "18": "Tampines, Pasir Ris",
  "19": "Serangoon, Hougang, Punggol",
  "20": "Bishan, Ang Mo Kio",
  "21": "Upper Bukit Timah, Clementi Park",
  "22": "Jurong",
  "23": "Hillview, Dairy Farm, Bukit Panjang",
  "24": "Lim Chu Kang, Tengah",
  "25": "Kranji, Woodlands",
  "26": "Upper Thomson, Springleaf",
  "27": "Yishun, Sembawang",
  "28": "Seletar",
};

/**
 * Shared template data types for the property showcase scaffold.
 */
export interface PropertyPhoto {
  src: string;
  alt: string;
}

export interface ComparableProperty {
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
}

export interface NeighborhoodData {
  name: string;
  overview: string;
  commute: string[];
  schools: string[];
}

export interface AgentData {
  name: string;
  phone: string;
  email: string;
  license: string;
  bio: string;
}

export interface PropertyData {
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  tenure: string;
  floor: string;
  description: string;
  headline: string;
  subheadline: string;
  photos: PropertyPhoto[];
  neighborhood: NeighborhoodData;
  comparables: ComparableProperty[];
  highlights: string[];
  agent: AgentData;
}

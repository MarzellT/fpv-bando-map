/** Access category for a spot. Colour on the map encodes access, not quality. */
export type Category = 'go' | 'club' | 'ask' | 'hot' | 'zone';

/** A single FPV "bando" / lost-place record. */
export interface Bando {
  /** Latitude (WGS84). */
  lat: number;
  /** Longitude (WGS84). */
  lon: number;
  /** Access category. */
  cat: Category;
  /** Site name. */
  name: string;
  /** Town / district. */
  town: string;
  /** Short status line (e.g. "Derelict, fire-damaged"). */
  status: string;
  /** Description as an HTML fragment (paragraphs, hazard notes). */
  body: string;
  /** The single most useful next step (access / permission). */
  next: string;
}

export interface CategoryMeta {
  label: string;
  color: string;
}

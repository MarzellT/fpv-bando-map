export interface Origin {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
export interface Video {
  id: string;
  title: string;
  pilotId: string;
  publishedAt: string;
  match: 'named' | 'visual' | 'likely';
  timestampSeconds: number;
  note: string;
}
export interface Source {
  title: string;
  url: string;
  type: string;
  date?: string;
}
export interface Spot {
  id: string;
  name: string;
  city: string;
  region: string;
  type: string;
  lat: number | null;
  lon: number | null;
  coordinatePrecision: 'site' | 'approximate';
  confidence: 'confirmed' | 'likely' | 'open';
  summary: string;
  features: string[];
  status: {
    label: string;
    tone: 'documented' | 'caution' | 'uncertain';
    note: string;
    lastEvidence: string | null;
  };
  videos: Video[];
  sources: Source[];
}
export interface Pilot {
  id: string;
  name: string;
  handle: string;
  url: string;
  region?: string;
  description?: string;
}
export interface Edge {
  sourceId: string;
  targetId: string;
  type: 'session' | 'same-spot' | 'reference';
  label: string;
  url: string;
  date: string | null;
}
export interface Dataset {
  checkedAt: string;
  origins: Origin[];
  spots: Spot[];
  pilots: Pilot[];
  edges: Edge[];
}

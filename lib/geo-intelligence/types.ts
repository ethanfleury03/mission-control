export type GeoDealerStatus = 'active' | 'inactive' | 'archived';
export type GeoLayerKey =
  | 'dealers'
  | 'dealerNetwork'
  | 'countryHeatmap'
  | 'stateHeatmap'
  | 'contactCoverage';

export interface GeoFilterState {
  ownerId: string;
  lifecycleStage: string;
  leadStatus: string;
  persona: string;
}

export interface GeoFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface GeoFiltersCatalog {
  owners: GeoFilterOption[];
  lifecycleStages: GeoFilterOption[];
  leadStatuses: GeoFilterOption[];
  personas: GeoFilterOption[];
}

export interface GeoSyncMeta {
  status: string;
  lastAttemptedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  totalRecords: number;
  mappableRecords: number;
  unmappableRecords: number;
  stale: boolean;
  hubspotConfigured: boolean;
}

export interface GeoDealer {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  countryCode: string;
  countryIsoA3: string;
  lat: number;
  lng: number;
  status: GeoDealerStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  sameCountryContacts: number;
  sameStateContacts: number;
  sameCityContacts: number;
}

export interface GeoDealerInput {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
  country: string;
  lat: number;
  lng: number;
  status?: GeoDealerStatus;
  notes?: string;
}

export interface GeoCoverageBucket {
  key: string;
  label: string;
  count: number;
  lat?: number;
  lng?: number;
  isoA3?: string;
  code?: string;
}

export interface GeoTopStat {
  key: string;
  label: string;
  count: number;
}

export interface GeoSummary {
  activeDealers: number;
  countriesCovered: number;
  statesCovered: number;
  hubspotContactsMapped: number;
  unmappedContacts: number;
}

export interface GeoArc {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  label: string;
}

export interface GeoDashboardSnapshot {
  summary: GeoSummary;
  arrowOrigin: {
    id: string;
    label: string;
    lat: number;
    lng: number;
  };
  dealers: GeoDealer[];
  dealerArcs: GeoArc[];
  countryBuckets: GeoCoverageBucket[];
  topCountries: GeoTopStat[];
  topStates: GeoTopStat[];
  topOwners: GeoTopStat[];
  topPersonas: GeoTopStat[];
  filters: GeoFiltersCatalog;
  sync: GeoSyncMeta;
}

export interface GeoCountryDrilldownSnapshot {
  country: {
    isoA3: string;
    isoA2: string;
    name: string;
    lat: number;
    lng: number;
  };
  summary: {
    mappedContacts: number;
    statesWithCoverage: number;
    activeDealers: number;
  };
  stateBuckets: GeoCoverageBucket[];
  topStates: GeoTopStat[];
  dealers: GeoDealer[];
  cameraTarget: {
    lat: number;
    lng: number;
    altitude: number;
  };
  availableAdmin1: boolean;
}

export interface GeoDashboardRequest extends GeoFilterState {
  countryIsoA3?: string;
}

export interface GeoHubSpotSnapshotRow {
  hubspotContactId: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  countryCode: string;
  countryIsoA3: string;
  stateRegion: string;
  stateCode: string;
  stateKey: string;
  city: string;
  ownerId: string;
  ownerName: string;
  lifecycleStage: string;
  leadStatus: string;
  persona: string;
  isMappable: boolean;
  sourceUpdatedAt?: Date | null;
  lastSyncedAt: Date;
}

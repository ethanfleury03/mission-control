/**
 * Explicit dev/demo seed for Geo Intelligence.
 * Safe to run repeatedly: mock records are replaced in-place, real records are preserved.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { GEO_SYNC_SCOPE_ID } from './constants';
import { buildCountryIdentity, buildStateKey } from './normalize';
import { ensureGeoIntelligenceSchema } from './schema';

type SeedOwner = {
  id: string;
  name: string;
};

type SeedCity = {
  name: string;
  lat: number;
  lng: number;
  postalCode: string;
};

type SeedRegion = {
  name: string;
  code: string;
  cities: [SeedCity, SeedCity];
};

type SeedDealer = {
  name: string;
  addressLine1: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  lat: number;
  lng: number;
  notes: string;
};

type SeedCountry = {
  country: string;
  code: string;
  contactsPerCity: number;
  regions: [SeedRegion, SeedRegion, SeedRegion, SeedRegion];
  dealers: [SeedDealer, SeedDealer];
};

type GeoSeedResult = {
  seededDealers: number;
  seededContacts: number;
  totalRecords: number;
  mappableRecords: number;
  unmappableRecords: number;
};

const MOCK_DEALER_NOTE_PREFIX = '[mock-geo]';
const MOCK_CONTACT_PREFIX = 'mock-geo-';
const LOCAL_CONTACT_MULTIPLIER = 9;

const OWNERS: SeedOwner[] = [
  { id: 'geo-owner-nadia', name: 'Nadia Chen' },
  { id: 'geo-owner-miguel', name: 'Miguel Alvarez' },
  { id: 'geo-owner-priya', name: 'Priya Raman' },
  { id: 'geo-owner-jordan', name: 'Jordan Lee' },
  { id: 'geo-owner-claire', name: 'Claire Dubois' },
  { id: 'geo-owner-omar', name: 'Omar Haddad' },
  { id: 'geo-owner-harper', name: 'Harper Cole' },
  { id: 'geo-owner-yuki', name: 'Yuki Sato' },
];

const LIFECYCLE_STAGES = ['subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity'];
const LEAD_STATUSES = ['new', 'open', 'working', 'qualified', 'nurturing', 're-engage'];
const PERSONAS = [
  'Dealer Principal',
  'Regional Operations',
  'Service Director',
  'Parts Manager',
  'Channel Sales',
  'Field Marketing',
];
const FIRST_NAMES = [
  'Alex',
  'Sam',
  'Jordan',
  'Taylor',
  'Morgan',
  'Cameron',
  'Avery',
  'Riley',
  'Logan',
  'Parker',
  'Casey',
  'Quinn',
  'Harper',
  'Jamie',
  'Kai',
  'Drew',
  'Elliot',
  'Finley',
  'Rowan',
  'Sage',
];
const LAST_NAMES = [
  'Carter',
  'Morgan',
  'Singh',
  'Martinez',
  'Bennett',
  'Nguyen',
  'Howard',
  'Patel',
  'Sullivan',
  'Wright',
  'Kim',
  'Morales',
  'Turner',
  'Diaz',
  'Brooks',
  'Lopez',
  'Scott',
  'Reed',
  'Torres',
  'Gray',
];

const GEO_SEED_COUNTRIES: SeedCountry[] = [
  {
    country: 'United States',
    code: 'US',
    contactsPerCity: 12,
    regions: [
      {
        name: 'California',
        code: 'CA',
        cities: [
          { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, postalCode: '90015' },
          { name: 'San Diego', lat: 32.7157, lng: -117.1611, postalCode: '92101' },
        ],
      },
      {
        name: 'Texas',
        code: 'TX',
        cities: [
          { name: 'Austin', lat: 30.2672, lng: -97.7431, postalCode: '78701' },
          { name: 'Dallas', lat: 32.7767, lng: -96.797, postalCode: '75201' },
        ],
      },
      {
        name: 'Illinois',
        code: 'IL',
        cities: [
          { name: 'Chicago', lat: 41.8781, lng: -87.6298, postalCode: '60601' },
          { name: 'Naperville', lat: 41.7508, lng: -88.1535, postalCode: '60540' },
        ],
      },
      {
        name: 'New York',
        code: 'NY',
        cities: [
          { name: 'New York', lat: 40.7128, lng: -74.006, postalCode: '10001' },
          { name: 'Buffalo', lat: 42.8864, lng: -78.8784, postalCode: '14202' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Apex Motion West',
        addressLine1: '410 Harbor Commerce Dr',
        city: 'Los Angeles',
        stateRegion: 'California',
        postalCode: '90015',
        lat: 34.0522,
        lng: -118.2437,
        notes: `${MOCK_DEALER_NOTE_PREFIX} West Coast industrial channel hub.`,
      },
      {
        name: 'Great Lakes Fleet Systems',
        addressLine1: '920 W Fulton Market',
        city: 'Chicago',
        stateRegion: 'Illinois',
        postalCode: '60607',
        lat: 41.8781,
        lng: -87.6298,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Midwest service and parts partner.`,
      },
    ],
  },
  {
    country: 'Canada',
    code: 'CA',
    contactsPerCity: 11,
    regions: [
      {
        name: 'Ontario',
        code: 'ON',
        cities: [
          { name: 'Toronto', lat: 43.6532, lng: -79.3832, postalCode: 'M5H 2N2' },
          { name: 'Ottawa', lat: 45.4215, lng: -75.6972, postalCode: 'K1P 1J1' },
        ],
      },
      {
        name: 'British Columbia',
        code: 'BC',
        cities: [
          { name: 'Vancouver', lat: 49.2827, lng: -123.1207, postalCode: 'V6B 1A1' },
          { name: 'Victoria', lat: 48.4284, lng: -123.3656, postalCode: 'V8W 1P6' },
        ],
      },
      {
        name: 'Alberta',
        code: 'AB',
        cities: [
          { name: 'Calgary', lat: 51.0447, lng: -114.0719, postalCode: 'T2P 1J9' },
          { name: 'Edmonton', lat: 53.5461, lng: -113.4938, postalCode: 'T5J 1A1' },
        ],
      },
      {
        name: 'Quebec',
        code: 'QC',
        cities: [
          { name: 'Montreal', lat: 45.5017, lng: -73.5673, postalCode: 'H2Y 1C6' },
          { name: 'Quebec City', lat: 46.8139, lng: -71.208, postalCode: 'G1R 4P5' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Northline Equipment Toronto',
        addressLine1: '155 Front St W',
        city: 'Toronto',
        stateRegion: 'Ontario',
        postalCode: 'M5J 2L6',
        lat: 43.6532,
        lng: -79.3832,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Greater Toronto distribution anchor.`,
      },
      {
        name: 'Prairie Edge Systems',
        addressLine1: '225 8 Ave SW',
        city: 'Calgary',
        stateRegion: 'Alberta',
        postalCode: 'T2P 2W3',
        lat: 51.0447,
        lng: -114.0719,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Western Canada heavy-duty specialist.`,
      },
    ],
  },
  {
    country: 'United Kingdom',
    code: 'GB',
    contactsPerCity: 10,
    regions: [
      {
        name: 'England',
        code: 'ENG',
        cities: [
          { name: 'London', lat: 51.5072, lng: -0.1276, postalCode: 'EC2V 6DN' },
          { name: 'Manchester', lat: 53.4808, lng: -2.2426, postalCode: 'M2 5DB' },
        ],
      },
      {
        name: 'Scotland',
        code: 'SCT',
        cities: [
          { name: 'Edinburgh', lat: 55.9533, lng: -3.1883, postalCode: 'EH2 2PF' },
          { name: 'Glasgow', lat: 55.8642, lng: -4.2518, postalCode: 'G2 1DH' },
        ],
      },
      {
        name: 'Wales',
        code: 'WLS',
        cities: [
          { name: 'Cardiff', lat: 51.4816, lng: -3.1791, postalCode: 'CF10 1EP' },
          { name: 'Swansea', lat: 51.6214, lng: -3.9436, postalCode: 'SA1 3SN' },
        ],
      },
      {
        name: 'Northern Ireland',
        code: 'NIR',
        cities: [
          { name: 'Belfast', lat: 54.5973, lng: -5.9301, postalCode: 'BT1 5GS' },
          { name: 'Derry', lat: 54.9966, lng: -7.3086, postalCode: 'BT48 6HQ' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Meridian Industrial London',
        addressLine1: '110 Bishopsgate',
        city: 'London',
        stateRegion: 'England',
        postalCode: 'EC2N 4AY',
        lat: 51.5072,
        lng: -0.1276,
        notes: `${MOCK_DEALER_NOTE_PREFIX} UK capital accounts and finance cluster.`,
      },
      {
        name: 'Northern Service Network',
        addressLine1: '75 Deansgate',
        city: 'Manchester',
        stateRegion: 'England',
        postalCode: 'M3 2BW',
        lat: 53.4808,
        lng: -2.2426,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Northern England and Scotland coverage node.`,
      },
    ],
  },
  {
    country: 'Germany',
    code: 'DE',
    contactsPerCity: 10,
    regions: [
      {
        name: 'Bavaria',
        code: 'BY',
        cities: [
          { name: 'Munich', lat: 48.1351, lng: 11.582, postalCode: '80331' },
          { name: 'Nuremberg', lat: 49.4521, lng: 11.0767, postalCode: '90402' },
        ],
      },
      {
        name: 'North Rhine-Westphalia',
        code: 'NW',
        cities: [
          { name: 'Cologne', lat: 50.9375, lng: 6.9603, postalCode: '50667' },
          { name: 'Dusseldorf', lat: 51.2277, lng: 6.7735, postalCode: '40213' },
        ],
      },
      {
        name: 'Baden-Wurttemberg',
        code: 'BW',
        cities: [
          { name: 'Stuttgart', lat: 48.7758, lng: 9.1829, postalCode: '70173' },
          { name: 'Heidelberg', lat: 49.3988, lng: 8.6724, postalCode: '69117' },
        ],
      },
      {
        name: 'Berlin',
        code: 'BE',
        cities: [
          { name: 'Berlin', lat: 52.52, lng: 13.405, postalCode: '10115' },
          { name: 'Potsdam', lat: 52.39, lng: 13.0645, postalCode: '14467' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Rhine Motion Cologne',
        addressLine1: '22 Hohenzollernring',
        city: 'Cologne',
        stateRegion: 'North Rhine-Westphalia',
        postalCode: '50672',
        lat: 50.9375,
        lng: 6.9603,
        notes: `${MOCK_DEALER_NOTE_PREFIX} DACH service and fleet operations partner.`,
      },
      {
        name: 'Bavaria Precision Network',
        addressLine1: '48 Maximilianstrasse',
        city: 'Munich',
        stateRegion: 'Bavaria',
        postalCode: '80539',
        lat: 48.1351,
        lng: 11.582,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Southern Germany manufacturing corridor.`,
      },
    ],
  },
  {
    country: 'Australia',
    code: 'AU',
    contactsPerCity: 9,
    regions: [
      {
        name: 'New South Wales',
        code: 'NSW',
        cities: [
          { name: 'Sydney', lat: -33.8688, lng: 151.2093, postalCode: '2000' },
          { name: 'Newcastle', lat: -32.9283, lng: 151.7817, postalCode: '2300' },
        ],
      },
      {
        name: 'Victoria',
        code: 'VIC',
        cities: [
          { name: 'Melbourne', lat: -37.8136, lng: 144.9631, postalCode: '3000' },
          { name: 'Geelong', lat: -38.1499, lng: 144.3617, postalCode: '3220' },
        ],
      },
      {
        name: 'Queensland',
        code: 'QLD',
        cities: [
          { name: 'Brisbane', lat: -27.4698, lng: 153.0251, postalCode: '4000' },
          { name: 'Gold Coast', lat: -28.0167, lng: 153.4, postalCode: '4217' },
        ],
      },
      {
        name: 'Western Australia',
        code: 'WA',
        cities: [
          { name: 'Perth', lat: -31.9505, lng: 115.8605, postalCode: '6000' },
          { name: 'Fremantle', lat: -32.0569, lng: 115.7439, postalCode: '6160' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Southern Cross Sydney',
        addressLine1: '88 Market St',
        city: 'Sydney',
        stateRegion: 'New South Wales',
        postalCode: '2000',
        lat: -33.8688,
        lng: 151.2093,
        notes: `${MOCK_DEALER_NOTE_PREFIX} East coast distribution and rollout anchor.`,
      },
      {
        name: 'Portside Melbourne Systems',
        addressLine1: '41 Collins St',
        city: 'Melbourne',
        stateRegion: 'Victoria',
        postalCode: '3000',
        lat: -37.8136,
        lng: 144.9631,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Victoria service and support specialist.`,
      },
    ],
  },
  {
    country: 'Brazil',
    code: 'BR',
    contactsPerCity: 9,
    regions: [
      {
        name: 'Sao Paulo',
        code: 'SP',
        cities: [
          { name: 'Sao Paulo', lat: -23.5505, lng: -46.6333, postalCode: '01000-000' },
          { name: 'Campinas', lat: -22.9099, lng: -47.0626, postalCode: '13010-111' },
        ],
      },
      {
        name: 'Rio de Janeiro',
        code: 'RJ',
        cities: [
          { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, postalCode: '20000-000' },
          { name: 'Niteroi', lat: -22.8832, lng: -43.1034, postalCode: '24020-005' },
        ],
      },
      {
        name: 'Minas Gerais',
        code: 'MG',
        cities: [
          { name: 'Belo Horizonte', lat: -19.9167, lng: -43.9345, postalCode: '30110-000' },
          { name: 'Uberlandia', lat: -18.9146, lng: -48.2754, postalCode: '38400-000' },
        ],
      },
      {
        name: 'Rio Grande do Sul',
        code: 'RS',
        cities: [
          { name: 'Porto Alegre', lat: -30.0346, lng: -51.2177, postalCode: '90010-000' },
          { name: 'Caxias do Sul', lat: -29.1678, lng: -51.1794, postalCode: '95010-001' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Andes Trade Sao Paulo',
        addressLine1: '125 Avenida Paulista',
        city: 'Sao Paulo',
        stateRegion: 'Sao Paulo',
        postalCode: '01311-000',
        lat: -23.5505,
        lng: -46.6333,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Southeast Brazil fleet growth channel.`,
      },
      {
        name: 'Sul Motion Porto Alegre',
        addressLine1: '890 Rua dos Andradas',
        city: 'Porto Alegre',
        stateRegion: 'Rio Grande do Sul',
        postalCode: '90020-006',
        lat: -30.0346,
        lng: -51.2177,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Southern Brazil dealer network anchor.`,
      },
    ],
  },
  {
    country: 'India',
    code: 'IN',
    contactsPerCity: 11,
    regions: [
      {
        name: 'Maharashtra',
        code: 'MH',
        cities: [
          { name: 'Mumbai', lat: 19.076, lng: 72.8777, postalCode: '400001' },
          { name: 'Pune', lat: 18.5204, lng: 73.8567, postalCode: '411001' },
        ],
      },
      {
        name: 'Karnataka',
        code: 'KA',
        cities: [
          { name: 'Bengaluru', lat: 12.9716, lng: 77.5946, postalCode: '560001' },
          { name: 'Mysuru', lat: 12.2958, lng: 76.6394, postalCode: '570001' },
        ],
      },
      {
        name: 'Tamil Nadu',
        code: 'TN',
        cities: [
          { name: 'Chennai', lat: 13.0827, lng: 80.2707, postalCode: '600001' },
          { name: 'Coimbatore', lat: 11.0168, lng: 76.9558, postalCode: '641001' },
        ],
      },
      {
        name: 'Gujarat',
        code: 'GJ',
        cities: [
          { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714, postalCode: '380001' },
          { name: 'Vadodara', lat: 22.3072, lng: 73.1812, postalCode: '390001' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Peninsula Motion Mumbai',
        addressLine1: '14 Nariman Point',
        city: 'Mumbai',
        stateRegion: 'Maharashtra',
        postalCode: '400021',
        lat: 19.076,
        lng: 72.8777,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Western India enterprise accounts node.`,
      },
      {
        name: 'South Grid Bengaluru',
        addressLine1: '65 Residency Rd',
        city: 'Bengaluru',
        stateRegion: 'Karnataka',
        postalCode: '560025',
        lat: 12.9716,
        lng: 77.5946,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Technology and service-led expansion partner.`,
      },
    ],
  },
  {
    country: 'Japan',
    code: 'JP',
    contactsPerCity: 10,
    regions: [
      {
        name: 'Tokyo',
        code: '13',
        cities: [
          { name: 'Tokyo', lat: 35.6762, lng: 139.6503, postalCode: '100-0001' },
          { name: 'Hachioji', lat: 35.655, lng: 139.3239, postalCode: '192-0083' },
        ],
      },
      {
        name: 'Osaka',
        code: '27',
        cities: [
          { name: 'Osaka', lat: 34.6937, lng: 135.5023, postalCode: '530-0001' },
          { name: 'Sakai', lat: 34.5733, lng: 135.4828, postalCode: '590-0077' },
        ],
      },
      {
        name: 'Aichi',
        code: '23',
        cities: [
          { name: 'Nagoya', lat: 35.1815, lng: 136.9066, postalCode: '450-0002' },
          { name: 'Toyota', lat: 35.0834, lng: 137.1563, postalCode: '471-0025' },
        ],
      },
      {
        name: 'Fukuoka',
        code: '40',
        cities: [
          { name: 'Fukuoka', lat: 33.5904, lng: 130.4017, postalCode: '810-0001' },
          { name: 'Kitakyushu', lat: 33.883, lng: 130.8752, postalCode: '802-0001' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Metro Precision Tokyo',
        addressLine1: '1-9 Marunouchi',
        city: 'Tokyo',
        stateRegion: 'Tokyo',
        postalCode: '100-0005',
        lat: 35.6762,
        lng: 139.6503,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Kanto region coordination and support.`,
      },
      {
        name: 'Kansai Field Services',
        addressLine1: '2-4 Umeda',
        city: 'Osaka',
        stateRegion: 'Osaka',
        postalCode: '530-0001',
        lat: 34.6937,
        lng: 135.5023,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Kansai maintenance and operations footprint.`,
      },
    ],
  },
  {
    country: 'Mexico',
    code: 'MX',
    contactsPerCity: 9,
    regions: [
      {
        name: 'Jalisco',
        code: 'JA',
        cities: [
          { name: 'Guadalajara', lat: 20.6597, lng: -103.3496, postalCode: '44100' },
          { name: 'Puerto Vallarta', lat: 20.6534, lng: -105.2253, postalCode: '48300' },
        ],
      },
      {
        name: 'Nuevo Leon',
        code: 'NL',
        cities: [
          { name: 'Monterrey', lat: 25.6866, lng: -100.3161, postalCode: '64000' },
          { name: 'San Pedro Garza Garcia', lat: 25.6573, lng: -100.4028, postalCode: '66220' },
        ],
      },
      {
        name: 'Ciudad de Mexico',
        code: 'CMX',
        cities: [
          { name: 'Mexico City', lat: 19.4326, lng: -99.1332, postalCode: '06000' },
          { name: 'Coyoacan', lat: 19.3467, lng: -99.1617, postalCode: '04000' },
        ],
      },
      {
        name: 'Estado de Mexico',
        code: 'MEX',
        cities: [
          { name: 'Toluca', lat: 19.2826, lng: -99.6557, postalCode: '50000' },
          { name: 'Naucalpan', lat: 19.4753, lng: -99.2372, postalCode: '53000' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Pacifico Motion Guadalajara',
        addressLine1: '35 Av Juarez',
        city: 'Guadalajara',
        stateRegion: 'Jalisco',
        postalCode: '44100',
        lat: 20.6597,
        lng: -103.3496,
        notes: `${MOCK_DEALER_NOTE_PREFIX} West Mexico route and service coverage.`,
      },
      {
        name: 'Monterrey Industrial Bridge',
        addressLine1: '240 Ave Constitución',
        city: 'Monterrey',
        stateRegion: 'Nuevo Leon',
        postalCode: '64000',
        lat: 25.6866,
        lng: -100.3161,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Northern Mexico manufacturing corridor.`,
      },
    ],
  },
  {
    country: 'South Africa',
    code: 'ZA',
    contactsPerCity: 8,
    regions: [
      {
        name: 'Gauteng',
        code: 'GT',
        cities: [
          { name: 'Johannesburg', lat: -26.2041, lng: 28.0473, postalCode: '2000' },
          { name: 'Pretoria', lat: -25.7479, lng: 28.2293, postalCode: '0002' },
        ],
      },
      {
        name: 'Western Cape',
        code: 'WC',
        cities: [
          { name: 'Cape Town', lat: -33.9249, lng: 18.4241, postalCode: '8001' },
          { name: 'Stellenbosch', lat: -33.9321, lng: 18.8602, postalCode: '7600' },
        ],
      },
      {
        name: 'KwaZulu-Natal',
        code: 'KZN',
        cities: [
          { name: 'Durban', lat: -29.8587, lng: 31.0218, postalCode: '4001' },
          { name: 'Pietermaritzburg', lat: -29.6006, lng: 30.3794, postalCode: '3201' },
        ],
      },
      {
        name: 'Eastern Cape',
        code: 'EC',
        cities: [
          { name: 'Gqeberha', lat: -33.9608, lng: 25.6022, postalCode: '6001' },
          { name: 'East London', lat: -33.0153, lng: 27.9116, postalCode: '5201' },
        ],
      },
    ],
    dealers: [
      {
        name: 'Highveld Motion Johannesburg',
        addressLine1: '85 Commissioner St',
        city: 'Johannesburg',
        stateRegion: 'Gauteng',
        postalCode: '2001',
        lat: -26.2041,
        lng: 28.0473,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Inland fleet and service operations anchor.`,
      },
      {
        name: 'Cape Route Systems',
        addressLine1: '12 Long St',
        city: 'Cape Town',
        stateRegion: 'Western Cape',
        postalCode: '8000',
        lat: -33.9249,
        lng: 18.4241,
        notes: `${MOCK_DEALER_NOTE_PREFIX} Coastal logistics and export corridor partner.`,
      },
    ],
  },
];

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function assertCountryIdentity(country: string, code: string) {
  const identity = buildCountryIdentity(country, code);
  if (!identity.countryIsoA3 || !identity.countryCode) {
    throw new Error(`Unable to resolve Geo seed country: ${country} (${code})`);
  }
  return identity;
}

function buildGeoDealerSeedRows(): Prisma.GeoDealerCreateManyInput[] {
  return GEO_SEED_COUNTRIES.flatMap((market) => {
    const identity = assertCountryIdentity(market.country, market.code);
    return market.dealers.map((dealer) => ({
      name: dealer.name,
      addressLine1: dealer.addressLine1,
      addressLine2: '',
      city: dealer.city,
      stateRegion: dealer.stateRegion,
      postalCode: dealer.postalCode,
      country: identity.country,
      countryCode: identity.countryCode,
      countryIsoA3: identity.countryIsoA3,
      lat: dealer.lat,
      lng: dealer.lng,
      status: 'active',
      notes: dealer.notes,
    }));
  });
}

function buildGeoContactSeedRows(): Prisma.GeoHubSpotContactSnapshotCreateManyInput[] {
  const seededAt = new Date();
  const rows: Prisma.GeoHubSpotContactSnapshotCreateManyInput[] = [];
  let globalIndex = 0;

  for (const [countryIndex, market] of GEO_SEED_COUNTRIES.entries()) {
    const identity = assertCountryIdentity(market.country, market.code);

    for (const [regionIndex, region] of market.regions.entries()) {
      const stateKey = buildStateKey(identity.countryIsoA3, identity.countryCode, region.name, region.code);

      for (const [cityIndex, city] of region.cities.entries()) {
        for (let contactIndex = 0; contactIndex < market.contactsPerCity * LOCAL_CONTACT_MULTIPLIER; contactIndex += 1) {
          const currentIndex = globalIndex;
          globalIndex += 1;

          const firstName = FIRST_NAMES[currentIndex % FIRST_NAMES.length];
          const lastName = LAST_NAMES[(currentIndex * 3) % LAST_NAMES.length];
          const owner = OWNERS[(currentIndex + regionIndex + cityIndex) % OWNERS.length];
          const lifecycleStage = LIFECYCLE_STAGES[(currentIndex + countryIndex) % LIFECYCLE_STAGES.length];
          const leadStatus = LEAD_STATUSES[(currentIndex + cityIndex) % LEAD_STATUSES.length];
          const persona = PERSONAS[(currentIndex + regionIndex) % PERSONAS.length];
          const email = `${slugify(firstName)}.${slugify(lastName)}.${slugify(city.name)}.${currentIndex + 1}@arrow-demo.test`;
          const sourceUpdatedAt = new Date(seededAt.getTime() - (currentIndex % 17) * 3_600_000);

          rows.push({
            hubspotContactId: `${MOCK_CONTACT_PREFIX}${String(currentIndex + 1).padStart(5, '0')}`,
            firstName,
            lastName,
            email,
            country: identity.country,
            countryCode: identity.countryCode,
            countryIsoA3: identity.countryIsoA3,
            stateRegion: region.name,
            stateCode: region.code,
            stateKey,
            city: city.name,
            ownerId: owner.id,
            ownerName: owner.name,
            lifecycleStage,
            leadStatus,
            persona,
            isMappable: true,
            sourceUpdatedAt,
            lastSyncedAt: seededAt,
          });
        }
      }
    }
  }

  return rows;
}

async function performGeoSeed(): Promise<GeoSeedResult> {
  await ensureGeoIntelligenceSchema();

  const dealers = buildGeoDealerSeedRows();
  const contacts = buildGeoContactSeedRows();

  await prisma.geoDealer.deleteMany({
    where: {
      notes: {
        contains: MOCK_DEALER_NOTE_PREFIX,
      },
    },
  });

  await prisma.geoHubSpotContactSnapshot.deleteMany({
    where: {
      hubspotContactId: {
        startsWith: MOCK_CONTACT_PREFIX,
      },
    },
  });

  if (dealers.length > 0) {
    await prisma.geoDealer.createMany({ data: dealers });
  }

  for (const contactBatch of chunk(contacts, 250)) {
    await prisma.geoHubSpotContactSnapshot.createMany({ data: contactBatch });
  }

  const [totalRecords, mappableRecords] = await Promise.all([
    prisma.geoHubSpotContactSnapshot.count(),
    prisma.geoHubSpotContactSnapshot.count({ where: { isMappable: true } }),
  ]);
  const unmappableRecords = totalRecords - mappableRecords;
  const syncedAt = new Date();

  await prisma.geoSyncState.upsert({
    where: { id: GEO_SYNC_SCOPE_ID },
    update: {
      status: 'synced',
      lastAttemptedAt: syncedAt,
      lastSyncedAt: syncedAt,
      lastError: '',
      totalRecords,
      mappableRecords,
      unmappableRecords,
    },
    create: {
      id: GEO_SYNC_SCOPE_ID,
      status: 'synced',
      lastAttemptedAt: syncedAt,
      lastSyncedAt: syncedAt,
      lastError: '',
      totalRecords,
      mappableRecords,
      unmappableRecords,
    },
  });

  return {
    seededDealers: dealers.length,
    seededContacts: contacts.length,
    totalRecords,
    mappableRecords,
    unmappableRecords,
  };
}

let seedLock: Promise<void> = Promise.resolve();

export async function seedGeoDemoData(): Promise<GeoSeedResult> {
  const result = seedLock.then(() => performGeoSeed());
  seedLock = result.then(
    () => {},
    () => {},
  );
  return result;
}

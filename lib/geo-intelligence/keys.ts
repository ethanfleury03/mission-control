export function normalizeGeoKey(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildFeatureStateKeys(properties: {
  iso31662?: string;
  name?: string;
  nameAlt?: string;
  adm0A3?: string;
}) {
  const keys = new Set<string>();
  const adm0A3 = (properties.adm0A3 ?? '').toUpperCase();
  const iso31662 = (properties.iso31662 ?? '').toUpperCase();

  if (iso31662) keys.add(iso31662);
  if (adm0A3 && properties.name) keys.add(`name:${adm0A3}:${normalizeGeoKey(properties.name)}`);
  if (adm0A3 && properties.nameAlt) keys.add(`name:${adm0A3}:${normalizeGeoKey(properties.nameAlt)}`);

  return [...keys];
}

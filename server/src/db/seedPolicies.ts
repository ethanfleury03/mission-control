/**
 * Seed minimal tool and data access policies if none exist.
 * Idempotent: only runs if policies are empty.
 */

import { getDb } from '../database';
import { RegistryRepository } from '../registry/repository';

export async function seedPoliciesIfEmpty(): Promise<void> {
  const repo = new RegistryRepository(getDb());
  const [toolPolicies, dataPolicies] = await Promise.all([
    repo.getToolPolicies('global', null),
    repo.getDataAccessPolicies('global', null),
  ]);

  if (toolPolicies.length > 0 && dataPolicies.length > 0) {
    return;
  }

  if (toolPolicies.length === 0) {
    await repo.upsertToolPolicy({
      scope_type: 'global',
      scope_id: null,
      tool_name: 'web_search',
      permission: 'read',
      require_approval: false,
    });
    console.log('Seeded global tool policy: web_search');
  }

  if (dataPolicies.length === 0) {
    await repo.upsertDataAccessPolicy({
      scope_type: 'global',
      scope_id: null,
      resource: 'org_chart',
      permission: 'read',
    });
    console.log('Seeded global data access policy: org_chart');
  }
}

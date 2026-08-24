import { NextResponse } from 'next/server';
import { listOrganizations } from '@/lib/auth/store';

export const dynamic = 'force-dynamic';

/**
 * Liste publique des organisations actives, pour le formulaire d'inscription.
 *
 * Volontairement reduite au strict necessaire : identifiant, nom, type et
 * region. Aucune adresse, aucun contact, aucun effectif — cette route est
 * accessible sans authentification.
 */
export function GET() {
  const organizations = listOrganizations('active')
    .filter((o) => o.type !== 'platform')
    .map((o) => ({ id: o.id, name: o.name, type: o.type, region: o.region }));

  return NextResponse.json({ organizations });
}

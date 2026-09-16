import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { audit, insert, nowIso, run, uid } from '@/lib/db';
import { checkPasswordStrength } from '@/lib/auth/password';
import { authenticate, createOrganization, createUser, getPolicy, passwordPolicy } from '@/lib/auth/store';
import { requestContext, startSession } from '@/lib/auth/session';
import { currentPort, needsBootstrap, networkAddresses } from '@/lib/auth/bootstrap';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, ORG_TYPES, type OrgType } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

interface BootstrapBody {
  facilityName?: string;
  facilityType?: string;
  facilityCode?: string;
  region?: string;
  fullName?: string;
  email?: string;
  password?: string;
}

/** Etat de l'installation : sert a l'ecran d'amorcage avant toute authentification. */
export function GET() {
  const pending = needsBootstrap();
  return NextResponse.json({
    needsBootstrap: pending,
    // Les adresses ne sont revelees que pendant l'amorcage. Une fois
    // l'application en service, la topologie du reseau n'a pas a etre
    // consultable sans etre authentifie.
    addresses: pending ? networkAddresses(currentPort()) : [],
    passwordPolicy: pending ? passwordPolicy() : null,
  });
}

/**
 * Creation du tout premier compte d'une installation.
 *
 * Accessible sans authentification — c'est inevitable, personne ne peut encore
 * se connecter — mais UNIQUEMENT tant que la table des comptes est vide. Le
 * controle est refait ici, a l'interieur de la route : le middleware laisse
 * passer le chemin, il ne verifie pas l'etat de la base.
 */
export async function POST(req: Request) {
  if (!needsBootstrap()) {
    return NextResponse.json(
      {
        error:
          "L'installation est deja amorcee. La creation du premier compte n'est possible que sur une base vierge ; les comptes suivants se creent depuis la console d'administration.",
      },
      { status: 409 },
    );
  }

  const data = await body<BootstrapBody>(req);

  if (!data.facilityName?.trim()) {
    return NextResponse.json({ error: "Le nom de la structure est obligatoire." }, { status: 400 });
  }
  if (!data.fullName?.trim()) {
    return NextResponse.json({ error: 'Le nom du responsable est obligatoire.' }, { status: 400 });
  }

  const email = data.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
  }

  // La politique par defaut doit exister avant de juger le mot de passe.
  getPolicy();
  const problems = checkPasswordStrength(data.password ?? '', passwordPolicy());
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  const facilityType = (data.facilityType as OrgType) ?? 'health-center';
  if (!ORG_TYPES.includes(facilityType) || facilityType === 'platform') {
    return NextResponse.json({ error: 'Type de structure invalide.' }, { status: 400 });
  }

  try {
    // Matrice role -> permissions, si la base est vierge.
    for (const role of ROLES) {
      for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
        run('INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)', [role, permission]);
      }
    }

    // L'organisation « plateforme » porte les comptes d'administration ;
    // la structure de soins porte les medecins et les dossiers.
    const platformId = createOrganization({
      type: 'platform',
      name: 'ParleDocteur',
      code: 'PD-PLATFORM',
      status: 'active',
    });
    const facilityId = createOrganization({
      type: facilityType,
      name: data.facilityName.trim(),
      code: data.facilityCode?.trim() || null,
      region: data.region?.trim() || null,
      parent_id: platformId,
      status: 'active',
    });

    const user = createUser({
      email,
      password: data.password!,
      fullName: data.fullName.trim(),
      role: 'super_admin',
      organizationId: platformId,
      status: 'active',
      // Le responsable a choisi son mot de passe lui-meme : rien a changer.
      mustChangePassword: false,
    });

    insert('audit_log', {
      id: uid(),
      at: nowIso(),
      actor_id: user.id,
      actor_label: user.full_name,
      action: 'create',
      entity: 'installation',
      entity_id: facilityId,
      detail: JSON.stringify({ structure: data.facilityName.trim(), responsable: email }),
    });
    audit({
      action: 'create',
      entity: 'user_account',
      entityId: user.id,
      actorId: user.id,
      actorLabel: user.full_name,
      detail: 'premier super-administrateur (amorcage de l installation)',
    });

    // Session ouverte dans la foulee : le responsable enchaine sur l'ecran de
    // confirmation sans avoir a ressaisir ce qu'il vient de definir.
    const session = authenticate(email, data.password!, await requestContext());
    if (session.ok && session.token) await startSession(session.token);

    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
        organization: { id: facilityId, name: data.facilityName.trim() },
        addresses: networkAddresses(currentPort()),
        signedIn: session.ok,
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Amorcage impossible." },
      { status: 500 },
    );
  }
}

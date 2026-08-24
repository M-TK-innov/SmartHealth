import { NextResponse } from 'next/server';
import { body } from '@/lib/api';
import { insert, nowIso, uid } from '@/lib/db';
import { checkPasswordStrength } from '@/lib/auth/password';
import {
  createOrganization,
  createUser,
  getOrganization,
  getPolicy,
  getUserByEmail,
  passwordPolicy,
} from '@/lib/auth/store';
import { ROLE_ORG_TYPE, SELF_REGISTRABLE_ROLES, isRole, type OrgType } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

interface RegisterBody {
  role?: string;
  fullName?: string;
  email?: string;
  password?: string;
  phone?: string;
  licenseNumber?: string;
  qualification?: string;
  organizationId?: string;
  organizationName?: string;
  organizationType?: string;
  organizationCode?: string;
  region?: string;
}

/**
 * Inscription.
 *
 * Un compte cree ici n'est jamais actif d'emblee si la politique exige une
 * validation : c'est un administrateur du niveau superieur qui l'active. Les
 * roles d'administration ne sont pas ouverts a l'inscription libre — on ne
 * s'auto-declare pas administrateur de la plateforme.
 */
export async function POST(req: Request) {
  const data = await body<RegisterBody>(req);
  const policy = getPolicy();

  if (policy.allow_self_registration !== 1) {
    return NextResponse.json(
      { error: "L'inscription libre est desactivee. Demandez la creation de votre compte a votre administrateur." },
      { status: 403 },
    );
  }

  const role = data.role;
  if (!isRole(role) || !SELF_REGISTRABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Role invalide. Roles ouverts a l inscription : ${SELF_REGISTRABLE_ROLES.join(', ')}.` },
      { status: 400 },
    );
  }

  const email = data.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
  }
  if (!data.fullName?.trim()) {
    return NextResponse.json({ error: 'Le nom complet est obligatoire.' }, { status: 400 });
  }
  if (getUserByEmail(email)) {
    return NextResponse.json({ error: 'Un compte existe deja avec cette adresse e-mail.' }, { status: 409 });
  }

  const problems = checkPasswordStrength(data.password ?? '', passwordPolicy());
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  // ------------------------------------------------------------ organisation
  let organizationId = data.organizationId?.trim() || null;

  if (organizationId) {
    const org = getOrganization(organizationId);
    if (!org) return NextResponse.json({ error: 'Etablissement introuvable.' }, { status: 400 });
    if (org.status !== 'active') {
      return NextResponse.json(
        { error: "Cet etablissement n'est pas encore active sur la plateforme." },
        { status: 400 },
      );
    }
  } else if (role === 'medecin') {
    return NextResponse.json(
      { error: 'Selectionnez l etablissement dans lequel vous exercez.' },
      { status: 400 },
    );
  } else {
    // Un etablissement ou un ministere qui s'inscrit cree son organisation,
    // elle-meme en attente de validation.
    if (!data.organizationName?.trim()) {
      return NextResponse.json({ error: "Le nom de l'organisation est obligatoire." }, { status: 400 });
    }
    const allowed = ROLE_ORG_TYPE[role] ?? [];
    const type = (data.organizationType as OrgType) ?? allowed[0];
    if (!allowed.includes(type)) {
      return NextResponse.json(
        { error: `Type d organisation invalide pour ce role (attendu : ${allowed.join(' ou ')}).` },
        { status: 400 },
      );
    }
    organizationId = createOrganization({
      type,
      name: data.organizationName.trim(),
      code: data.organizationCode?.trim() || null,
      region: data.region?.trim() || null,
      status: 'pending',
    });
  }

  // ------------------------------------------------------------------ compte
  const requiresValidation = policy.require_admin_validation === 1;

  let practitionerId: string | null = null;
  if (role === 'medecin') {
    // Le medecin a une fiche praticien : c'est elle qui signe les comptes
    // rendus et les ordonnances, le compte ne sert qu'a se connecter.
    const parts = data.fullName.trim().split(/\s+/);
    practitionerId = uid();
    insert('practitioner', {
      id: practitionerId,
      given_name: parts[0],
      family_name: parts.slice(1).join(' ') || parts[0],
      qualification: data.qualification?.trim() || 'Medecin',
      license_number: data.licenseNumber?.trim() || null,
      email,
      phone: data.phone?.trim() || null,
      facility_id: organizationId,
      created_at: nowIso(),
    });
  }

  try {
    const user = createUser({
      email,
      password: data.password!,
      fullName: data.fullName,
      role,
      organizationId,
      phone: data.phone?.trim() || null,
      licenseNumber: data.licenseNumber?.trim() || null,
      practitionerId,
      status: requiresValidation ? 'pending' : 'active',
    });

    return NextResponse.json(
      {
        user: { id: user.id, email: user.email, role: user.role, status: user.status },
        pending: requiresValidation,
        message: requiresValidation
          ? 'Demande enregistree. Votre compte sera actif des sa validation par un administrateur.'
          : 'Compte cree. Vous pouvez vous connecter.',
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Inscription impossible.' }, { status: 400 });
  }
}

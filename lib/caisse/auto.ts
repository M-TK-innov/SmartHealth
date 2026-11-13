import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import {
  codeConsultation,
  tarifer,
  type ActeAFacturer,
  type Tarif,
  type Urgence,
} from './tarification.ts';

/**
 * La facture se remplit des actes, au fil du sejour.
 *
 * CE QUI SE PASSAIT AVANT : un agent recopiait a la caisse ce qu'un autre
 * avait fait au cabinet, en lisant le dossier. Une consultation oubliee n'est
 * jamais facturee ; une consultation comptee deux fois est payee deux fois.
 * Les deux erreurs sont invisibles a qui n'a pas le dossier sous les yeux.
 *
 * TROIS GARANTIES, ET AUCUNE N'EST NEGOCIABLE
 *
 * 1. UN ACTE N'EST FACTURE QU'UNE FOIS. Chaque ligne automatique porte sa
 *    source — « consultation:<id> » — et un index unique interdit la seconde.
 *    Signer deux fois, recharger la page, rejouer un appel : la facture ne
 *    bouge plus apres la premiere.
 *
 * 2. UN ACTE SANS TARIF N'EST PAS FACTURE A ZERO. Il est refuse, le refus
 *    nomme le code manquant, et l'acte reste visible comme non tarife. Une
 *    ligne a zero ressemble a une gratuite decidee par quelqu'un.
 *
 * 3. UN ECHEC DE FACTURATION N'ANNULE PAS LE SOIN. Signer une consultation
 *    reussit meme si la facture refuse : on ne retient pas un compte rendu
 *    parce qu'un tarif manque au bareme. L'appelant recoit le refus et
 *    l'affiche ; il ne le propage pas.
 */

export interface Contexte {
  acteurId?: string | null;
  organizationId?: string | null;
}

export type Facturation =
  | { ok: true; ligneId: string; montant: number }
  | { ok: true; deja: true }
  | { ok: false; motif: string; codeManquant: string | null };

/** Le bareme de l'etablissement. Les tarifs generaux completent les siens. */
export function baremeDe(organizationId: string | null): Tarif[] {
  return all<Tarif>(
    `SELECT code, libelle, montant FROM tarif
      WHERE actif = 1 AND (organization_id = ? OR organization_id IS NULL)
      ORDER BY CASE WHEN organization_id IS NULL THEN 1 ELSE 0 END`,
    [organizationId],
  ).reduce<Tarif[]>((garde, t) => {
    // Le premier gagne : la requete place le bareme de l'etablissement avant
    // le bareme general, donc un centre qui a pose son prix le garde.
    if (!garde.some((x) => x.code === t.code)) garde.push(t);
    return garde;
  }, []);
}

/**
 * Ajoute un acte a la facture ouverte d'un sejour.
 *
 * Rend `deja` quand la source a deja produit sa ligne : ce n'est pas une
 * erreur, c'est le cas normal d'une seconde tentative.
 */
export function facturerActe(
  sejourId: string,
  acte: ActeAFacturer,
  ctx: Contexte,
): Facturation {
  let facture = get<{ id: string }>(
    'SELECT id FROM facture WHERE sejour_id = ? AND close = 0 ORDER BY created_at DESC LIMIT 1',
    [sejourId],
  );

  // LA FACTURE NAIT DU PREMIER ACTE. Refuser faute de facture obligerait
  // quelqu'un a en ouvrir une a la main avant chaque consultation, et c'est
  // exactement le geste que cette automatisation existe pour supprimer.
  //
  // On ne l'ouvre QUE si le sejour est encore en cours : facturer un sejour
  // clos rouvrirait une comptabilite arretee.
  if (!facture) {
    const sejour = get<{ id: string; organization_id: string | null }>(
      'SELECT id, organization_id FROM sejour WHERE id = ? AND sorti_le IS NULL',
      [sejourId],
    );
    if (!sejour) {
      return {
        ok: false,
        motif: 'Sejour clos ou introuvable : l acte n est pas facture.',
        codeManquant: null,
      };
    }
    const nouvelle = randomUUID();
    insert('facture', {
      id: nouvelle,
      sejour_id: sejourId,
      organization_id: sejour.organization_id ?? ctx.organizationId ?? null,
      part_tiers: 0,
      tiers_nom: null,
      close: 0,
    });
    audit({
      action: 'create',
      entity: 'facture',
      entityId: nouvelle,
      actorId: ctx.acteurId ?? undefined,
      detail: { sejour: sejourId, ouverte_par: 'premier acte facturable' },
    });
    facture = { id: nouvelle };
  }

  // On regarde AVANT d'essayer d'ecrire : l'index unique ferait echouer
  // l'insertion, mais une exception attrapee ne dit pas si elle vient du
  // doublon ou d'autre chose.
  const existante = get<{ id: string }>(
    'SELECT id FROM facture_ligne WHERE facture_id = ? AND source = ?',
    [facture.id, acte.source],
  );
  if (existante) return { ok: true, deja: true };

  const d = tarifer(acte, baremeDe(ctx.organizationId ?? null));
  if (!d.ok) return { ok: false, motif: d.motif, codeManquant: d.codeManquant };

  const id = randomUUID();
  return tx(() => {
    insert('facture_ligne', {
      id,
      facture_id: facture.id,
      libelle: d.ligne.libelle,
      montant: d.ligne.montant,
      quantite: d.ligne.quantite,
      urgence: d.ligne.urgence,
      acteur_id: ctx.acteurId ?? null,
      source: d.ligne.source,
    });
    run("UPDATE facture SET updated_at = datetime('now') WHERE id = ?", [facture.id]);
    audit({
      action: 'create',
      entity: 'facture_ligne',
      entityId: id,
      actorId: ctx.acteurId ?? undefined,
      detail: {
        facture: facture.id,
        source: d.ligne.source,
        libelle: d.ligne.libelle,
        montant: d.ligne.montant,
        automatique: true,
      },
    });
    return { ok: true as const, ligneId: id, montant: d.ligne.montant * d.ligne.quantite };
  });
}

/**
 * Facture une consultation signee.
 *
 * APPELEE A LA SIGNATURE, PAS A L'OUVERTURE. Une consultation ouverte peut
 * etre annulee ; une consultation signee a eu lieu. Facturer plus tot
 * remplirait la caisse de consultations qui n'ont jamais existe.
 *
 * Sans sejour rattache, il n'y a pas de facture : une consultation externe
 * sans passage enregistre se facture a la main, et c'est normal.
 */
export function facturerConsultation(
  consultationId: string,
  ctx: Contexte,
): Facturation {
  const c = get<{
    id: string;
    patient_id: string;
    status: string;
    encounter_class: string | null;
  }>('SELECT id, patient_id, status, encounter_class FROM consultation WHERE id = ?', [
    consultationId,
  ]);
  if (!c) {
    return { ok: false, motif: 'Consultation introuvable.', codeManquant: null };
  }
  if (c.status !== 'signed') {
    return {
      ok: false,
      motif: 'Une consultation se facture a la signature, pas avant.',
      codeManquant: null,
    };
  }

  const sejour = get<{ id: string }>(
    'SELECT id FROM sejour WHERE patient_id = ? AND sorti_le IS NULL ORDER BY admis_le DESC LIMIT 1',
    [c.patient_id],
  );
  if (!sejour) {
    return {
      ok: false,
      motif: 'Aucun sejour en cours : cette consultation se facture a la main.',
      codeManquant: null,
    };
  }

  // `EMER` est la classe FHIR d'une rencontre aux urgences. Tout le reste est
  // une consultation externe : on ne devine pas l'urgence a partir du motif.
  const urgence: Urgence = c.encounter_class === 'EMER' ? 'urgente' : 'programmable';

  return facturerActe(
    sejour.id,
    {
      code: codeConsultation(urgence),
      libelle: urgence === 'programmable' ? 'Consultation externe' : "Consultation d urgence",
      quantite: 1,
      urgence,
      source: `consultation:${consultationId}`,
    },
    ctx,
  );
}

/**
 * Les actes enregistres qu'aucun tarif ne couvre.
 *
 * Sert a l'ecran de la caisse : ce qui a ete fait, ce qui n'a pas pu etre
 * facture, et quel code ajouter au bareme. Sans cette liste, un acte non
 * tarife disparait sans bruit et le centre travaille gratuitement sans le
 * savoir.
 */
export function actesNonTarifes(
  organizationId: string | null,
): { code: string; libelle: string; depuis: string }[] {
  const bareme = new Set(baremeDe(organizationId).map((t) => t.code));

  const consultations = all<{ encounter_class: string | null; n: number; depuis: string }>(
    `SELECT c.encounter_class, COUNT(*) n, MIN(c.signed_at) depuis
       FROM consultation c
       JOIN sejour s ON s.patient_id = c.patient_id AND s.sorti_le IS NULL
       JOIN facture f ON f.sejour_id = s.id AND f.close = 0
      WHERE c.status = 'signed'
        AND (? IS NULL OR c.organization_id = ? OR c.organization_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM facture_ligne l
           WHERE l.facture_id = f.id AND l.source = 'consultation:' || c.id
        )
      GROUP BY c.encounter_class`,
    [organizationId, organizationId],
  );

  const manquants: { code: string; libelle: string; depuis: string }[] = [];
  for (const c of consultations) {
    const code = codeConsultation(c.encounter_class === 'EMER' ? 'urgente' : 'programmable');
    if (!bareme.has(code)) {
      manquants.push({
        code,
        libelle: `${c.n} consultation${c.n > 1 ? 's' : ''} signee${c.n > 1 ? 's' : ''} non facturee${c.n > 1 ? 's' : ''}`,
        depuis: c.depuis ?? '',
      });
    }
  }
  return manquants;
}

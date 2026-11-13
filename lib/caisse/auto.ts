import { randomUUID } from 'node:crypto';
import { all, audit, get, insert, run, tx } from '../db.ts';
import {
  codeConsultation,
  codeExamen,
  codeMedicament,
  tarifer,
  type ActeAFacturer,
  type Tarif,
  type Urgence,
} from './tarification.ts';
import { appliquerAFacture, type Convention } from './convention.ts';

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
    // LA PART DE L'ASSURANCE SE RECALCULE A CHAQUE ACTE, dans la meme
    // transaction. Une facture qui grossit voit sa part de tiers grossir avec
    // elle, et un plafond ne se constate qu'une fois le total connu. La figer
    // a l'ouverture ferait payer au patient des actes que son regime couvre.
    appliquerConvention(facture.id, ctx);

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


/**
 * Facture un examen dont le resultat a ete valide.
 *
 * VALIDE, ET NON RENDU. Un resultat rendu peut encore etre corrige — les
 * donnees de demonstration en portent un exemple, une kaliemie passee de 4,2
 * a 6,8 apres inversion de tube. Facturer a la sortie de l'automate
 * facturerait aussi les examens qu'on refait pour cette raison.
 */
export function facturerExamen(demandeId: string, ctx: Contexte): Facturation {
  const d = get<{
    id: string;
    sejour_id: string | null;
    examen: string;
    loinc_code: string | null;
    etat: string;
    priorite: string;
  }>(
    'SELECT id, sejour_id, examen, loinc_code, etat, priorite FROM demande_examen WHERE id = ?',
    [demandeId],
  );
  if (!d) return { ok: false, motif: 'Demande d examen introuvable.', codeManquant: null };
  if (d.etat !== 'validee') {
    return {
      ok: false,
      motif: 'Un examen se facture a la validation du resultat, pas avant.',
      codeManquant: null,
    };
  }
  if (!d.sejour_id) {
    return {
      ok: false,
      motif: 'Examen sans sejour rattache : il se facture a la main.',
      codeManquant: null,
    };
  }

  return facturerActe(
    d.sejour_id,
    {
      code: codeExamen(d.loinc_code, d.examen),
      libelle: d.examen,
      quantite: 1,
      urgence: d.priorite === 'vitale' ? 'vitale' : d.priorite === 'urgente' ? 'urgente' : 'programmable',
      source: `examen:${demandeId}`,
    },
    ctx,
  );
}

/**
 * Facture ce qui a ete reellement dispense.
 *
 * UNE LIGNE PAR MEDICAMENT SERVI, et la quantite est celle SORTIE DU RAYON,
 * pas celle prescrite. Une ordonnance de 21 comprimes servie a 7 faute de
 * stock ne se facture pas 21 : le patient paierait ce qu'il n'a pas recu, et
 * c'est le genre d'ecart qu'on ne retrouve jamais apres coup.
 */
export function facturerDispensation(dispensationId: string, ctx: Contexte): Facturation[] {
  const d = get<{ id: string; sejour_id: string | null }>(
    'SELECT id, sejour_id FROM dispensation WHERE id = ?',
    [dispensationId],
  );
  if (!d) {
    return [{ ok: false, motif: 'Dispensation introuvable.', codeManquant: null }];
  }
  if (!d.sejour_id) {
    return [
      { ok: false, motif: 'Dispensation sans sejour rattache : elle se facture a la main.', codeManquant: null },
    ];
  }

  const lignes = all<{ id: string; quantite: number; dci: string; atc: string | null }>(
    `SELECT dl.id, dl.quantite, a.dci, a.atc_code AS atc
       FROM dispensation_ligne dl JOIN article a ON a.id = dl.article_id
      WHERE dl.dispensation_id = ?`,
    [dispensationId],
  );
  if (lignes.length === 0) {
    return [{ ok: false, motif: 'Dispensation sans ligne servie.', codeManquant: null }];
  }

  return lignes.map((l) =>
    facturerActe(
      d.sejour_id!,
      {
        code: codeMedicament(l.atc, l.dci),
        libelle: l.dci,
        quantite: l.quantite,
        urgence: 'programmable',
        // La source descend jusqu'a LA LIGNE : deux medicaments d'une meme
        // dispensation sont deux actes, et une seule source pour les deux en
        // ferait disparaitre un.
        source: `dispensation-ligne:${l.id}`,
      },
      ctx,
    ),
  );
}

/** Les conventions d'assurance de l'etablissement. */
export function conventionsDe(organizationId: string | null): Convention[] {
  return all<Convention>(
    `SELECT regime, code, taux, plafond FROM convention
      WHERE actif = 1 AND (organization_id = ? OR organization_id IS NULL)`,
    [organizationId],
  );
}

export interface PriseEnChargeAppliquee {
  partTiers: number;
  resteACharge: number;
  regime: string | null;
  motif: string;
  /** Vrai quand la facture a ete mise a jour. */
  ecrite: boolean;
}

/**
 * Applique la convention d'assurance a une facture ouverte.
 *
 * RECALCULEE A CHAQUE ACTE, et non une fois pour toutes a l'ouverture : une
 * facture qui grossit voit sa part de tiers grossir avec elle, et un plafond
 * ne se constate qu'une fois le total connu.
 *
 * ELLE N'ECRIT QUE SUR UNE FACTURE OUVERTE. Une facture close porte une
 * somme que quelqu'un a payee : la recalculer apres coup ferait varier un
 * reste a charge deja regle.
 */
export function appliquerConvention(factureId: string, ctx: Contexte): PriseEnChargeAppliquee {
  const f = get<{ id: string; close: number; sejour_id: string; part_tiers: number }>(
    'SELECT id, close, sejour_id, part_tiers FROM facture WHERE id = ?',
    [factureId],
  );
  if (!f) {
    return { partTiers: 0, resteACharge: 0, regime: null, motif: 'Facture introuvable.', ecrite: false };
  }
  if (f.close === 1) {
    return {
      partTiers: f.part_tiers,
      resteACharge: 0,
      regime: null,
      motif: 'Facture close : la prise en charge n est plus recalculee.',
      ecrite: false,
    };
  }

  // UNE AUTOMATISATION N'EFFACE PAS LE CHIFFRE D'UN HUMAIN parce qu'elle
  // n'en sait pas plus. Une facture qui porte un tiers nomme vient d'une
  // convention convenue hors du systeme — une mutuelle qui a donne son
  // accord par telephone, un fonds d'urgence. Si le dossier du patient ne
  // nomme aucun regime, ce calcul n'a RIEN a dire, et mettre zero
  // transformerait une prise en charge acquise en dette.
  const dejaConvenue = get<{ tiers_nom: string | null }>(
    'SELECT tiers_nom FROM facture WHERE id = ?',
    [factureId],
  )?.tiers_nom;

  const patient = get<{ insurance_scheme: string | null }>(
    `SELECT p.insurance_scheme FROM patient p
       JOIN sejour s ON s.patient_id = p.id
      WHERE s.id = ?`,
    [f.sejour_id],
  );

  // Les lignes portent un libelle, pas leur code au bareme : on retrouve le
  // code par la source quand elle existe, et on retombe sur « * » sinon. Une
  // ligne saisie a la main n'a pas de code, et la regle generale est la seule
  // qui puisse s'y appliquer.
  const lignes = all<{ libelle: string; montant: number; quantite: number; source: string | null }>(
    'SELECT libelle, montant, quantite, source FROM facture_ligne WHERE facture_id = ?',
    [factureId],
  ).map((l) => ({
    code: codeDeLaSource(l.source),
    montant: l.montant * l.quantite,
  }));

  const regime = patient?.insurance_scheme ?? null;

  if (!regime && dejaConvenue) {
    return {
      partTiers: f.part_tiers,
      resteACharge: 0,
      regime: null,
      motif: `Prise en charge convenue avec « ${dejaConvenue} », conservee : aucun regime n est enregistre au dossier du patient.`,
      ecrite: false,
    };
  }

  const p = appliquerAFacture(lignes, conventionsDe(ctx.organizationId ?? null), regime);

  // Meme prudence a l'arrivee : un calcul qui rendrait zero sur une facture
  // deja prise en charge se tait plutot que d'effacer.
  if (p.partTiers === 0 && f.part_tiers > 0 && dejaConvenue) {
    return {
      partTiers: f.part_tiers,
      resteACharge: 0,
      regime: null,
      motif: `La convention « ${regime} » ne couvre rien ici, mais « ${dejaConvenue} » avait ete convenu : le montant est conserve.`,
      ecrite: false,
    };
  }

  if (p.partTiers === f.part_tiers) {
    return { ...p, ecrite: false };
  }

  run("UPDATE facture SET part_tiers = ?, updated_at = datetime('now') WHERE id = ?", [
    p.partTiers,
    factureId,
  ]);
  audit({
    action: 'update',
    entity: 'facture',
    entityId: factureId,
    actorId: ctx.acteurId ?? undefined,
    detail: { part_tiers: p.partTiers, regime: p.regime, automatique: true },
  });

  return { ...p, ecrite: true };
}

/**
 * Le code au bareme que porte une source de ligne.
 *
 * `consultation:<id>` ne dit pas si la consultation etait externe ou
 * urgente : on retombe alors sur la regle generale. C'est volontairement
 * approximatif — l'alternative serait de stocker le code sur la ligne, ce qui
 * dupliquerait une information que le bareme porte deja.
 */
function codeDeLaSource(source: string | null): string {
  if (!source) return '*';
  const [famille, reste] = source.split(':');
  if (famille === 'examen') return '*';
  if (famille === 'dispensation-ligne') return '*';
  if (famille === 'consultation') return '*';
  return reste ? `${famille}:${reste}` : '*';
}

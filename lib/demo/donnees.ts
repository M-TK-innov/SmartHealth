/**
 * Jeu de demonstration — FICHIER GENERE, ne pas modifier a la main.
 *
 *   npm run demo:dump
 *
 * Produit par scripts/demo-dump.mjs a partir de scripts/seed.mjs, qui
 * reste la seule source de verite. Les horodatages sont des jetons
 * relatifs resolus au chargement : voir lib/demo/horodatage.ts.
 *
 * 264 lignes, 45 tables.
 */

export const DONNEES_DEMO = `
-- access_policy (1)
INSERT INTO access_policy (id, password_min_length, password_require_mixed, session_hours, max_failed_attempts, lockout_minutes, allow_self_registration, require_admin_validation, updated_by, updated_at) VALUES (1, 10, 1, 12, 5, 15, 1, 1, NULL, '{{T+0}}');

-- acquittement_critique (1)
INSERT INTO acquittement_critique (id, resultat_id, transmis_a, transmis_par, commentaire, transmis_le) VALUES ('0cf5a44f-cb21-4896-a84b-83f099ffefe4', 'd9dc47ec-3b96-4f6a-aa14-5cb20400a2c5', 'Dr Ama Sossou', 'Biologiste de garde', 'Appelee au telephone, ECG demande dans la foulee.', '{{T-112}}');

-- allergy (1)
INSERT INTO allergy (id, patient_id, substance, atc_code, category, criticality, reaction, recorded_at, source_consultation_id) VALUES ('8f771be6-60cd-492c-9fa5-e4d0f73b2aa0', '2090d8ae-4408-4d86-9008-79f0b143fe5a', 'Amoxicilline', 'J01CA04', 'medication', 'high', 'Urticaire generalisee et oedeme des levres', '{{T-432000}}', NULL);

-- article (6)
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('60f07327-1c00-4e10-b239-00261ae6bccc', '175965d8-d5ec-4197-a368-898138d55e60', 'Amoxicilline', 'comprime', '500 mg', NULL, 'unite', 200, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('84dbc9d3-e449-4107-b65f-decbabfbe2a2', '175965d8-d5ec-4197-a368-898138d55e60', 'Artemether/lumefantrine', 'comprime', '20/120 mg', NULL, 'unite', 120, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('faa9b039-2639-4547-b8b7-874385c9fb06', '175965d8-d5ec-4197-a368-898138d55e60', 'Paracetamol', 'comprime', '500 mg', NULL, 'unite', 300, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('11c5582a-1f8b-4dee-a584-ca30ee7d4c16', '175965d8-d5ec-4197-a368-898138d55e60', 'Ceftriaxone', 'injectable', '1 g', NULL, 'unite', 40, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('10738809-d1dc-412b-9d6b-e7cbc4a73b7e', '175965d8-d5ec-4197-a368-898138d55e60', 'Sulfadoxine/pyrimethamine', 'comprime', '500/25 mg', NULL, 'unite', 100, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('75e227df-bfd7-4320-b68c-f66126a290ee', '175965d8-d5ec-4197-a368-898138d55e60', 'Sels de rehydratation orale', 'sachet', NULL, NULL, 'sachet', 150, 1, '{{T+0}}');

-- audit_log (1)
INSERT INTO audit_log (id, at, actor_id, actor_label, action, entity, entity_id, patient_id, detail, ip) VALUES ('04009f33-8eee-4741-83c8-c60da30ebd33', '{{T+0}}', NULL, 'seed', 'create', 'dataset', NULL, NULL, 'Jeu de demonstration : 3 organisations, 5 comptes, 3 patients, 4 unites, 6 postes.', NULL);

-- checklist_bloc (7)
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('d3c39a55-2496-45b8-a2d1-4a02d92e8099', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-induction', 'identite', 'Dr Ama Sossou', '{{T-24}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('e457d36b-3a66-4e84-8e4b-94f169dda1ae', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-induction', 'consentement', 'Dr Ama Sossou', '{{T-23}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('47de5215-e893-478e-9a9a-a3c556cbb62a', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-induction', 'site-marque', 'Dr Ama Sossou', '{{T-22}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('7a873104-c7e4-40c2-9b1e-32a68192ff41', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-induction', 'allergies', 'Dr Ama Sossou', '{{T-21}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('783fa8fb-7732-4e04-86fd-cef7ce2942aa', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-induction', 'materiel', 'Dr Ama Sossou', '{{T-20}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('25e990b7-dc7b-4f09-9425-d3c61fbaf6e2', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-incision', 'equipe-presentee', 'Dr Ama Sossou', '{{T-24}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('202d41cd-6475-4e1b-b8e3-d4a5c3900d9d', 'fe170a57-5b6a-48fc-8e5b-325038e5d096', 'avant-incision', 'antibioprophylaxie', 'Dr Ama Sossou', '{{T-23}}');

-- consultation (2)
INSERT INTO consultation (id, patient_id, practitioner_id, status, encounter_class, reason_text, started_at, ended_at, signed_at, language, consent_recording, consent_at, location, audio_duration_s, transcript_full, analysis_json, analysis_engine, analysis_at, report_markdown, report_edited, organization_id, sejour_id, created_at, updated_at) VALUES ('696433a7-40e3-48a6-9670-6e3e9c85651a', 'cbf2681c-f482-4bf9-b137-a9604730f7de', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', 'in-progress', 'AMB', 'Fievre depuis trois jours', '{{T+0}}', NULL, NULL, 'fr', 1, '{{T+0}}', 'Centre de Sante de Cotonou', 0, '[Medecin] Bonjour madame, asseyez-vous. Qu est-ce qui amene le petit Koffi aujourd hui ?
[Accompagnant] Docteur, il a le corps chaud depuis trois jours, et il ne mange plus.
[Medecin] Depuis trois jours. Est-ce qu il vomit ?
[Accompagnant] Il a vomi deux fois hier soir. Mais il n a pas la diarrhee.
[Medecin] Est-ce qu il tousse ?
[Accompagnant] Non, il ne tousse pas. Mais il tremble la nuit, il a des frissons.
[Medecin] D accord. Est-ce qu il dort sous moustiquaire ?
[Accompagnant] Parfois seulement, la moustiquaire est dechiree.
[Medecin] Je vais l examiner. Sa temperature est a 39,2 degres. Le pouls est a 132.
[Medecin] Il pese 13,5 kilos. Les conjonctives sont un peu pales.
[Medecin] L abdomen est souple, la gorge est propre, les tympans sont normaux.
[Medecin] Le tableau evoque fortement un paludisme simple. On va faire un test rapide, un TDR paludisme.
[Medecin] Je demande aussi une numeration formule sanguine pour verifier l anemie.
[Medecin] Est-ce qu il est allergique a quelque chose ?
[Accompagnant] Non, jamais eu de probleme avec les medicaments.
[Medecin] Bien. Je vous prescris de l artemether lumefantrine, deux fois par jour pendant trois jours, a prendre au cours des repas.
[Medecin] Et du paracetamol 250 milligrammes, trois fois par jour pendant trois jours pour la fievre.
[Medecin] Faites-le boire beaucoup. Reparez la moustiquaire, c est important.
[Medecin] Si il convulse, s il refuse de boire ou s il devient somnolent, revenez immediatement aux urgences.
[Medecin] Revenez me voir dans trois jours pour un controle.', NULL, NULL, NULL, NULL, 0, '175965d8-d5ec-4197-a368-898138d55e60', NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO consultation (id, patient_id, practitioner_id, status, encounter_class, reason_text, started_at, ended_at, signed_at, language, consent_recording, consent_at, location, audio_duration_s, transcript_full, analysis_json, analysis_engine, analysis_at, report_markdown, report_edited, organization_id, sejour_id, created_at, updated_at) VALUES ('4610e61b-2d95-4e05-a0e8-53069499e290', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', 'signed', 'AMB', 'Consultation prenatale du troisieme trimestre', '{{T-2880}}', '{{T-2840}}', '{{T-2825}}', 'fon', 1, '{{T-2880}}', 'Centre de Sante de Cotonou', 1140, '', NULL, NULL, NULL, NULL, 0, '175965d8-d5ec-4197-a368-898138d55e60', 'fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', '{{T-2880}}', '{{T-2825}}');

-- demande_examen (5)
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('65543c5f-ccd1-4410-8766-eba61ba24fab', '2090d8ae-4408-4d86-9008-79f0b143fe5a', '4763b9f5-464e-4179-8e57-5bb6e214b6cd', NULL, '175965d8-d5ec-4197-a368-898138d55e60', 'laboratoire', 'Kaliemie', NULL, 'urgente', 'validee', '{{T+0}}', '{{T+0}}', NULL, 1, '{{T+0}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('be2832fc-f2fe-4a8e-b037-58adf61fd0a1', '4270212d-9168-41dd-9cf9-72b5255e9c9d', 'fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', '53ad5e4d-f428-4951-bbb9-2e2cf11171ed', '175965d8-d5ec-4197-a368-898138d55e60', 'imagerie', 'Echographie obstetricale', NULL, 'routine', 'demandee', '{{T+0}}', NULL, NULL, 0, '{{T+0}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('3f79ebc4-433a-439e-a730-010d25218e0e', '2090d8ae-4408-4d86-9008-79f0b143fe5a', '4763b9f5-464e-4179-8e57-5bb6e214b6cd', NULL, '175965d8-d5ec-4197-a368-898138d55e60', 'laboratoire', 'Glycemie', '2339-0', 'urgente', 'validee', '{{T-190}}', '{{T-175}}', 'Infirmier de garde', 1, '{{T-190}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('b0b223c2-c3f6-4855-a668-1f09c8f89394', '4270212d-9168-41dd-9cf9-72b5255e9c9d', 'fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', NULL, '175965d8-d5ec-4197-a368-898138d55e60', 'laboratoire', 'Hemoglobine', '718-7', 'urgente', 'resultat-disponible', '{{T-95}}', '{{T-80}}', 'Infirmier de garde', 1, '{{T-95}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('8a64aaf1-baac-4a23-a20d-a59193a8a4aa', 'cbf2681c-f482-4bf9-b137-a9604730f7de', '93f59fa4-1528-48db-95ca-70356ae18557', NULL, '175965d8-d5ec-4197-a368-898138d55e60', 'laboratoire', 'Goutte epaisse', '32700-7', 'urgente', 'resultat-disponible', '{{T-30}}', '{{T-25}}', 'Technicien de laboratoire', 1, '{{T-30}}');

-- diagnosis (1)
INSERT INTO diagnosis (id, consultation_id, patient_id, label, icd10_code, snomed_code, rank, certainty, confidence, rationale, created_at) VALUES ('583f4670-c0aa-4bee-becb-387f0c5bb257', '4610e61b-2d95-4e05-a0e8-53069499e290', '4270212d-9168-41dd-9cf9-72b5255e9c9d', 'Surveillance de grossesse normale', 'Z34', '72892002', 1, 'confirmed', NULL, 'Terme concordant, tension normale, pas de signe d alerte.', '{{T-2835}}');

-- dispensation (1)
INSERT INTO dispensation (id, sejour_id, patient_id, prescription_id, organization_id, acteur_id, servi_le) VALUES ('a634c2b4-6977-4dd3-9f90-0392fae44aae', 'fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '6a8a16c3-922d-4087-aac1-f4f23fffeae4', '175965d8-d5ec-4197-a368-898138d55e60', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2805}}');

-- dispensation_ligne (1)
INSERT INTO dispensation_ligne (id, dispensation_id, article_id, lot_id, numero_lot, perime_le, quantite, created_at) VALUES ('9179b1b2-5b41-4e62-b11d-c3c6286536ac', 'a634c2b4-6977-4dd3-9f90-0392fae44aae', '60f07327-1c00-4e10-b239-00261ae6bccc', 'e46f2762-2b12-4fe9-86d3-d9990927ebd2', 'AMX-2512', '{{D+21}}', 21, '{{T-2805}}');

-- facture (2)
INSERT INTO facture (id, sejour_id, organization_id, part_tiers, tiers_nom, close, created_at, updated_at) VALUES ('18c3e5be-5120-4254-8eb0-3ba3f5737937', 'fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', '175965d8-d5ec-4197-a368-898138d55e60', 0, NULL, 1, '{{T-2820}}', '{{T-2800}}');
INSERT INTO facture (id, sejour_id, organization_id, part_tiers, tiers_nom, close, created_at, updated_at) VALUES ('b755d629-0489-4ac7-bb18-0842774a40b9', '4763b9f5-464e-4179-8e57-5bb6e214b6cd', '175965d8-d5ec-4197-a368-898138d55e60', 20000, 'Mutuelle des producteurs de l Oueme', 0, '{{T-1440}}', '{{T-30}}');

-- facture_ligne (7)
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('c8f24afb-9631-48f4-83da-0da094510968', '18c3e5be-5120-4254-8eb0-3ba3f5737937', 'Consultation prenatale', 1000, 1, 'programmable', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2820}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('d808c4c1-b828-429f-9973-c780a7735ec2', '18c3e5be-5120-4254-8eb0-3ba3f5737937', 'Amoxicilline 500 mg (21 comprimes)', 1500, 1, 'programmable', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2820}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('c3c55ce8-6891-46af-9fe9-f5cd82f1a60c', 'b755d629-0489-4ac7-bb18-0842774a40b9', 'Consultation d urgence', 2000, 1, 'urgente', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-1440}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('a24f67da-ba38-408c-ad68-bfda3d53fe8e', 'b755d629-0489-4ac7-bb18-0842774a40b9', 'Journee d hospitalisation', 3500, 2, 'programmable', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-1440}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('7cbf8970-29f7-4b18-a3e6-8f71f477e978', 'b755d629-0489-4ac7-bb18-0842774a40b9', 'Kaliemie', 2500, 1, 'urgente', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-180}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('27591a3b-d18b-4df5-9621-5423dfd6c0d2', 'b755d629-0489-4ac7-bb18-0842774a40b9', 'Glycemie', 1000, 1, 'urgente', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-180}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('7ee7cbb4-445f-422c-a8ac-e989a8a1d2bc', 'b755d629-0489-4ac7-bb18-0842774a40b9', 'Cure de hernie inguinale', 45000, 1, 'programmable', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-60}}');

-- intervention (2)
INSERT INTO intervention (id, patient_id, sejour_id, salle_id, organization_id, geste, lateralise, lateralite, debut_prevu, fin_prevue, etat, operateur_id, entree_le, incise_le, termine_le, created_at, updated_at) VALUES ('fe170a57-5b6a-48fc-8e5b-325038e5d096', '2090d8ae-4408-4d86-9008-79f0b143fe5a', '4763b9f5-464e-4179-8e57-5bb6e214b6cd', '567dc2b1-3e9f-41e5-9ed3-2dd88b28f705', '175965d8-d5ec-4197-a368-898138d55e60', 'Cure de hernie inguinale', 1, 'droite', '{{T-15}}', '{{T+105}}', 'patient-au-bloc', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-25}}', NULL, NULL, '{{T+0}}', '{{T-25}}');
INSERT INTO intervention (id, patient_id, sejour_id, salle_id, organization_id, geste, lateralise, lateralite, debut_prevu, fin_prevue, etat, operateur_id, entree_le, incise_le, termine_le, created_at, updated_at) VALUES ('ee4e0452-17da-48cd-b9fe-9355549aa492', '4270212d-9168-41dd-9cf9-72b5255e9c9d', NULL, '65a4a510-e8ba-4388-92c4-da2c3e5bcced', '175965d8-d5ec-4197-a368-898138d55e60', 'Cesarienne programmee', 0, 'sans-objet', '{{T+150}}', '{{T+240}}', 'programmee', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');

-- lit (28)
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('62d62161-5681-4419-b19c-fb6636d258e5', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-1', 'MED-01', 'occupe', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('6bd4bc1a-ff82-4c1f-85de-8a18f8cd216f', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-1', 'MED-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('6673be54-c0a1-4775-bc25-0f31772e6870', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-2', 'MED-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('4b447fa9-32f5-42b9-b31b-473d2abd8c4f', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-2', 'MED-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('7a75b1cc-5def-4e54-b24c-1d5de623cba6', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-3', 'MED-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('8123620e-ca6c-4366-a10c-6e68a5111bb5', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-3', 'MED-06', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('63861499-f378-4504-be06-faad979c522c', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-4', 'MED-07', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('a1423383-82b4-4c73-b86f-0c8978bb0630', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-4', 'MED-08', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('037fd038-1457-49a4-b2fe-d5f674310ad0', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-5', 'MED-09', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('78738d79-79a4-402d-99a8-ba2f83296fdf', '976d160d-4f5d-418d-b1cb-093eb11b55a4', 'MED-5', 'MED-10', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('bc66d2bd-1d1c-49e3-a2e0-14933123e2db', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-1', 'MAT-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('768d6c1a-87e1-4fba-864c-d4649ba31972', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-1', 'MAT-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('225d9a2e-df7d-419c-8ed0-c6a302e6f412', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-2', 'MAT-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('e84a5d19-8bf6-42ae-9650-8d7d40433c90', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-2', 'MAT-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b3a286e9-26b3-4bdc-99ce-d5195af97603', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-3', 'MAT-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('6ba4a978-27e5-446d-9526-06fe0e882e78', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-3', 'MAT-06', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('3f91c3ef-7372-403a-89fe-ccf71e1797ba', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-4', 'MAT-07', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('a05c3be4-d7d6-4483-be52-bde1e2dddc83', 'ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', 'MAT-4', 'MAT-08', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('0b8734b6-7fa5-49b5-9cf1-06b2cc97cda4', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-1', 'PED-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('620ba5bd-0f23-4d59-b9ff-64dc9fa65fe7', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-1', 'PED-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('9a1f4619-5fa3-4ccd-aa5f-d35f44742c6d', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-2', 'PED-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('16268e27-5f83-445e-9021-8c0fe71f7f7a', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-2', 'PED-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b5867a73-a870-437c-a021-3f0e07fa9718', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-3', 'PED-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('9d758d11-97f1-45fe-8048-c11d86e2790c', '7738bb92-edd6-4411-b1b1-28cbdf1c85fd', 'PED-3', 'PED-06', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('1553579e-a4bf-4716-a09d-23f1d4f66363', 'ca32fc06-fc50-4a69-8cd9-652b54cb983e', 'URG-1', 'URG-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('8d01a171-3fa6-4ff5-99b1-7066317cc9b5', 'ca32fc06-fc50-4a69-8cd9-652b54cb983e', 'URG-1', 'URG-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b6668acd-3870-4a69-bfb4-bf5512defcad', 'ca32fc06-fc50-4a69-8cd9-652b54cb983e', 'URG-2', 'URG-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('8c465e4a-deed-4af1-9f21-6595dab2f86f', 'ca32fc06-fc50-4a69-8cd9-652b54cb983e', 'URG-2', 'URG-04', 'a-preparer', 1, '{{T+0}}');

-- lot (6)
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('01960832-517d-427c-8abb-ebe4ec2df5de', '60f07327-1c00-4e10-b239-00261ae6bccc', 'AMX-2605', '{{D+420}}', 600, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('e46f2762-2b12-4fe9-86d3-d9990927ebd2', '60f07327-1c00-4e10-b239-00261ae6bccc', 'AMX-2512', '{{D+21}}', 129, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('d10c86b8-d5f8-423e-b7e0-4e078cc0698f', '84dbc9d3-e449-4107-b65f-decbabfbe2a2', 'ALU-2603', '{{D+260}}', 480, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('21aee27a-1ece-4c11-b93d-b8d7fdfcf9aa', 'faa9b039-2639-4547-b8b7-874385c9fb06', 'PAR-2611', '{{D+180}}', 300, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('a6db6e32-5e1b-4832-a38f-bdbc0a2d2b0d', '11c5582a-1f8b-4dee-a584-ca30ee7d4c16', 'CEF-2409', '{{D-35}}', 60, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('37743266-e464-4e7e-8d1f-ef79f055880f', '75e227df-bfd7-4320-b68c-f66126a290ee', 'SRO-2607', '{{D+540}}', 900, '{{T+0}}');

-- medication_statement (2)
INSERT INTO medication_statement (id, patient_id, drug_name, atc_code, dose, status, started_on, stopped_on, source_consultation_id) VALUES ('bc76c14d-76cf-4c08-84f0-9d2155c23eab', '2090d8ae-4408-4d86-9008-79f0b143fe5a', 'Amlodipine', 'C08CA01', '5 mg le matin', 'active', '{{D-280}}', NULL, NULL);
INSERT INTO medication_statement (id, patient_id, drug_name, atc_code, dose, status, started_on, stopped_on, source_consultation_id) VALUES ('3aac01db-70d0-42d3-9add-14758edf5e29', '2090d8ae-4408-4d86-9008-79f0b143fe5a', 'Metformine', 'A10BA02', '850 mg deux fois par jour', 'active', '{{D-280}}', NULL, NULL);

-- mouvement (1)
INSERT INTO mouvement (id, sejour_id, lit_id, unite_id, type, motif, acteur_id, survenu_le) VALUES ('22e24e0c-ce1a-4f86-8916-9283ee2701aa', '4763b9f5-464e-4179-8e57-5bb6e214b6cd', '62d62161-5681-4419-b19c-fb6636d258e5', NULL, 'admission', NULL, NULL, '{{T-1440}}');

-- mouvement_stock (7)
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('cf750556-9818-438e-a725-4d706289beb6', '01960832-517d-427c-8abb-ebe4ec2df5de', '60f07327-1c00-4e10-b239-00261ae6bccc', 'entree', 600, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('e9fe62ce-cdd4-4d46-a9a7-6f05010069a9', 'e46f2762-2b12-4fe9-86d3-d9990927ebd2', '60f07327-1c00-4e10-b239-00261ae6bccc', 'entree', 150, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('aa0653ae-a51d-4755-8f37-76fed420cbbc', 'd10c86b8-d5f8-423e-b7e0-4e078cc0698f', '84dbc9d3-e449-4107-b65f-decbabfbe2a2', 'entree', 480, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('8504135f-7023-4180-bf8f-4c840e79ffb1', '21aee27a-1ece-4c11-b93d-b8d7fdfcf9aa', 'faa9b039-2639-4547-b8b7-874385c9fb06', 'entree', 300, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('4f54b548-ac14-4f4b-8d4c-01a012546848', 'a6db6e32-5e1b-4832-a38f-bdbc0a2d2b0d', '11c5582a-1f8b-4dee-a584-ca30ee7d4c16', 'entree', 60, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('36dd53a8-8220-4045-8570-8ef7e541e707', '37743266-e464-4e7e-8d1f-ef79f055880f', '75e227df-bfd7-4320-b68c-f66126a290ee', 'entree', 900, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('4303e348-c748-486d-bcc7-9363f0c4e5d7', 'e46f2762-2b12-4fe9-86d3-d9990927ebd2', '60f07327-1c00-4e10-b239-00261ae6bccc', 'dispensation', -21, 'Ordonnance du 2026-10-25', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2805}}');

-- observation (5)
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('1089e483-6753-4fd8-bccb-d0c9baeec546', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '4610e61b-2d95-4e05-a0e8-53069499e290', 'vital-signs', '8480-6', 'Tension arterielle systolique', 118, NULL, 'mmHg', 'mm[Hg]', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('a651a9bf-9bb1-491f-bb01-355309fa4a5d', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '4610e61b-2d95-4e05-a0e8-53069499e290', 'vital-signs', '8462-4', 'Tension arterielle diastolique', 72, NULL, 'mmHg', 'mm[Hg]', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('262fc578-7387-4a5a-a4c7-090db20b6500', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '4610e61b-2d95-4e05-a0e8-53069499e290', 'vital-signs', '29463-7', 'Poids', 62, NULL, 'kg', 'kg', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('db8a2304-28da-4847-8577-785bfdb12547', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '4610e61b-2d95-4e05-a0e8-53069499e290', 'vital-signs', '11881-0', 'Hauteur uterine', 30, NULL, 'cm', 'cm', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('977284b0-e52e-4def-923d-5a9cfb5096ba', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '4610e61b-2d95-4e05-a0e8-53069499e290', 'vital-signs', '8310-5', 'Temperature', 36.9, NULL, 'degres C', 'Cel', NULL, '{{T-2865}}', 'clinician', NULL);

-- organization (3)
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('38e85f18-afa1-4210-a0f7-1a691ff4d8c5', 'platform', 'SmartHealth', 'PD-PLATFORM', NULL, 'BJ', NULL, NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('181848df-9fa4-441a-8038-e91c281c05d0', 'ministry', 'Ministere de la Sante', 'BJ-MS', '38e85f18-afa1-4210-a0f7-1a691ff4d8c5', 'BJ', NULL, NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('175965d8-d5ec-4197-a368-898138d55e60', 'health-center', 'Centre de Sante de Cotonou', 'BJ-LIT-CSC-001', '181848df-9fa4-441a-8038-e91c281c05d0', 'BJ', 'Littoral', NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');

-- paiement (3)
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('1a9c7781-ca1c-41d3-a82f-547b23008ff6', '18c3e5be-5120-4254-8eb0-3ba3f5737937', 2500, 'especes', NULL, '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2800}}');
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('d414eccf-36a7-4cfc-8b90-ce4df1f6ef3c', 'b755d629-0489-4ac7-bb18-0842774a40b9', 15000, 'mobile', 'MM-240917-884213', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-1380}}');
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('018f5b53-78ca-4ce9-84de-469b5280634f', 'b755d629-0489-4ac7-bb18-0842774a40b9', 5000, 'especes', NULL, '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-30}}');

-- passage (7)
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('41b057cf-52e4-4959-9be9-a562df9ff205', '94501a1e-9562-49fe-af64-2953ded51f68', 'c2c71d96-0329-4422-90d9-361ef0f202d9', 'standard', 'en-attente', '{{T-105}}', NULL, NULL, NULL, '{{T-105}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('dba72b74-3510-4022-8f4f-a9ff4ad99a13', 'dd8a2fcb-956a-492c-b06f-87120c460b22', 'c2c71d96-0329-4422-90d9-361ef0f202d9', 'differable', 'en-attente', '{{T-150}}', NULL, NULL, NULL, '{{T-150}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('906667a8-8851-4ded-a1cc-113659ef8fb2', '9a97526e-a19c-428c-9316-625109120626', 'c2c71d96-0329-4422-90d9-361ef0f202d9', 'standard', 'en-attente', '{{T-40}}', NULL, NULL, NULL, '{{T-40}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('6ee37b34-a4b6-4cc6-b061-4e5141e68a67', '7624f851-da75-46c4-9b37-5cb864e7543c', 'c2c71d96-0329-4422-90d9-361ef0f202d9', 'standard', 'parti', '{{T-190}}', NULL, '{{T-20}}', NULL, '{{T-190}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('92962005-6c87-4cae-8798-952a3e92443c', '089aec23-3aca-4d4a-9295-cd5139ea6c2c', '4be76423-4fe3-4938-885b-8b020b331bfe', 'vitale', 'en-attente', '{{T-6}}', NULL, NULL, NULL, '{{T-6}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('df19ab0e-63b0-4015-ad94-e565e9863d22', '7c4e8bfe-2570-4fd8-80f8-4bf7266b6841', '4be76423-4fe3-4938-885b-8b020b331bfe', 'standard', 'en-attente', '{{T-25}}', NULL, NULL, NULL, '{{T-25}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('411dda2d-d7c4-4c43-8fd7-45ddf21436fb', '93f59fa4-1528-48db-95ca-70356ae18557', 'c2c71d96-0329-4422-90d9-361ef0f202d9', 'urgente', 'en-cours', '{{T-35}}', '{{T-12}}', NULL, '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-35}}');

-- patient (9)
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('4270212d-9168-41dd-9cf9-72b5255e9c9d', 'CSC-2026-00001', NULL, NULL, NULL, 'Adjoa', 'Kossou', '1998-04-12', 0, 'female', '+229 96 12 34 56', NULL, 'Cotonou', 'Littoral', 'BJ', 'fon', NULL, 62, NULL, 1, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-172800}}', '{{T-172800}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('cbf2681c-f482-4bf9-b137-a9604730f7de', 'CSC-2026-00002', NULL, NULL, NULL, 'Koffi', 'Adjovi', '2022-09-03', 0, 'male', NULL, NULL, 'Abomey-Calavi', 'Atlantique', 'BJ', 'fr', NULL, 13.5, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-64800}}', '{{T-64800}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('2090d8ae-4408-4d86-9008-79f0b143fe5a', 'CSC-2026-00003', NULL, NULL, NULL, 'Bernard', 'Houngbedji', '1957-11-20', 0, 'male', '+229 95 88 77 66', NULL, 'Porto-Novo', 'Oueme', 'BJ', 'fr', 'O+', 84, 172, 0, 1, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-432000}}', '{{T-14400}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('d86b1be8-54f2-4471-a3a0-11fe68e2b531', 'CSC-2026-00004', NULL, NULL, NULL, 'Sika', 'Ahouansou', '1991-02-17', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-105}}', '{{T-105}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('07c9c8fc-c3c6-4f32-ba6f-80e81fc05910', 'CSC-2026-00005', NULL, NULL, NULL, 'Gaston', 'Dossou', '1969-08-05', 0, 'male', NULL, NULL, 'Abomey-Calavi', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-150}}', '{{T-150}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('10a29842-db30-4440-b530-8e9e6415ea47', 'CSC-2026-00006', NULL, NULL, NULL, 'Delphine', 'Zinsou', '2017-01-24', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-40}}', '{{T-40}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('34b6adf7-2d6f-4f7b-b4fc-fb3bb1b50200', 'CSC-2026-00007', NULL, NULL, NULL, 'Felicite', 'Agbo', '1986-12-02', 0, 'female', NULL, NULL, 'Porto-Novo', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-190}}', '{{T-190}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('a1a2054c-37ca-47f9-a2df-27083460781d', 'CSC-2026-00008', NULL, NULL, NULL, 'Rachidou', 'Bio', '1984-06-30', 0, 'male', NULL, NULL, 'Parakou', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-6}}', '{{T-6}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('9482186c-ec1d-46b1-b510-ba1568f30a89', 'CSC-2026-00009', NULL, NULL, NULL, 'Marguerite', 'Tossou', '1995-05-19', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T-25}}', '{{T-25}}');

-- poste (6)
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('84f66a2b-d86d-4cc3-93cb-d80b655a32c9', '175965d8-d5ec-4197-a368-898138d55e60', 'ACC', 'Accueil', 'accueil', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('4be76423-4fe3-4938-885b-8b020b331bfe', '175965d8-d5ec-4197-a368-898138d55e60', 'TRI', 'Triage', 'triage', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('c2c71d96-0329-4422-90d9-361ef0f202d9', '175965d8-d5ec-4197-a368-898138d55e60', 'CONS-1', 'Consultation 1', 'consultation', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('d53499b6-25a6-47c1-a595-75fe7e90e522', '175965d8-d5ec-4197-a368-898138d55e60', 'CAISSE', 'Caisse', 'caisse', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('6252765a-83f3-4c90-a454-f344aafbb3c5', '175965d8-d5ec-4197-a368-898138d55e60', 'PHARM', 'Pharmacie', 'pharmacie', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('12e5a4c5-598a-44d0-86bc-c7477d050f68', '175965d8-d5ec-4197-a368-898138d55e60', 'LABO', 'Laboratoire', 'laboratoire', 1, '{{T+0}}');

-- practitioner (1)
INSERT INTO practitioner (id, given_name, family_name, qualification, speciality_code, license_number, email, phone, signature_svg, facility_id, created_at) VALUES ('8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', 'Ama', 'Sossou', 'Medecin generaliste', '419772000', 'CNOM-BJ-4821', 'a.sossou@example.bj', '+229 97 00 00 00', NULL, '175965d8-d5ec-4197-a368-898138d55e60', '{{T+0}}');

-- prescription (1)
INSERT INTO prescription (id, consultation_id, patient_id, practitioner_id, status, origin, notes, safety_json, validated_by, validated_at, validation_note, cancelled_reason, qr_payload, created_at, updated_at) VALUES ('6a8a16c3-922d-4087-aac1-f4f23fffeae4', '4610e61b-2d95-4e05-a0e8-53069499e290', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', 'validated', 'ai-proposed', 'Traitement preventif intermittent du paludisme, troisieme dose.', NULL, '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', '{{T-2825}}', 'Posologie verifiee, grossesse au troisieme trimestre.', NULL, NULL, '{{T-2830}}', '{{T-2825}}');

-- prescription_item (2)
INSERT INTO prescription_item (id, prescription_id, seq, drug_name, brand_name, atc_code, form, strength, dose, route, frequency, frequency_per_day, duration_days, quantity, instructions, substitution_allowed, is_essential_list, ai_confidence, ai_rationale, edited_by_clinician, created_at) VALUES ('62bb5ca9-927b-433a-a2f5-95a01e1bf6d8', '6a8a16c3-922d-4087-aac1-f4f23fffeae4', 1, 'Sulfadoxine/pyrimethamine', NULL, 'P01BD51', 'comprime', '500/25 mg', '3 comprimes en prise unique', 'oral', 'dose unique supervisee', 1, 1, '3 comprimes', 'A prendre devant le soignant.', 1, 1, NULL, NULL, 1, '{{T-2830}}');
INSERT INTO prescription_item (id, prescription_id, seq, drug_name, brand_name, atc_code, form, strength, dose, route, frequency, frequency_per_day, duration_days, quantity, instructions, substitution_allowed, is_essential_list, ai_confidence, ai_rationale, edited_by_clinician, created_at) VALUES ('c94561c7-3d72-450f-973c-93561782378a', '6a8a16c3-922d-4087-aac1-f4f23fffeae4', 2, 'Amoxicilline', NULL, 'J01CA04', 'comprime', '500 mg', '1 comprime', 'oral', 'trois fois par jour', 3, 7, '21 comprimes', 'Pendant les repas. Aller au bout des sept jours.', 1, 1, NULL, NULL, 1, '{{T-2830}}');

-- problem (3)
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('822f262c-5df4-489f-8511-7fa228337be8', '4270212d-9168-41dd-9cf9-72b5255e9c9d', 'Surveillance de grossesse normale', 'Z34', NULL, 'problem-list-item', 'active', NULL, '{{T-129600}}', NULL, NULL, 'confirmed');
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('a914df9f-be60-4814-a4ec-a4b00d2f82fb', '2090d8ae-4408-4d86-9008-79f0b143fe5a', 'Hypertension essentielle (primitive)', 'I10', NULL, 'problem-list-item', 'active', NULL, '{{T-403200}}', NULL, NULL, 'confirmed');
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('9018bbe1-a367-46d9-a596-2987ba6003d7', '2090d8ae-4408-4d86-9008-79f0b143fe5a', 'Diabete sucre de type 2', 'E11', NULL, 'problem-list-item', 'active', NULL, '{{T-403200}}', NULL, NULL, 'confirmed');

-- resultat_examen (5)
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('e53857be-04c6-4b91-846f-97b9e0f2d52c', '65543c5f-ccd1-4410-8766-eba61ba24fab', 4.2, NULL, 'mmol/l', 'normal', 0, 'Automate BIO-2', '{{T-150}}', 'd9dc47ec-3b96-4f6a-aa14-5cb20400a2c5', 'Inversion de tube avec le lit voisin, detectee au controle d identite.');
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('d9dc47ec-3b96-4f6a-aa14-5cb20400a2c5', '65543c5f-ccd1-4410-8766-eba61ba24fab', 6.8, NULL, 'mmol/l', 'critique', 0, 'Automate BIO-2', '{{T-120}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('ffb039e2-b101-485e-ae6b-c23c8f2bf1f3', '3f79ebc4-433a-439e-a730-010d25218e0e', 1.9, NULL, 'g/l', 'normal', 0, 'Automate BIO-2', '{{T-140}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('113ace4b-fd90-449f-8cd6-1014372731a3', 'b0b223c2-c3f6-4855-a668-1f09c8f89394', 5.4, NULL, 'g/dl', 'critique', 1, 'Automate HEM-1', '{{T-20}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('498c105b-6487-4488-abed-ce82bc623b2d', '8a64aaf1-baac-4a23-a20d-a59193a8a4aa', 2400, 'Presence de trophozoites de Plasmodium falciparum.', 'parasites/ul', 'non-interprete', 0, 'Technicien de laboratoire', '{{T-8}}', NULL, NULL);

-- role_permission (91)
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'patient:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'patient:write');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'consultation:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'consultation:write');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'consultation:sign');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'prescription:validate');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'transcript:record');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'export:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'flux:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'flux:write');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'caisse:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'pharmacie:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'plateau:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'plateau:acquitter');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'bloc:read');
INSERT INTO role_permission (role, permission) VALUES ('medecin', 'bloc:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'patient:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'consultation:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'flux:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'flux:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'caisse:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'caisse:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'pharmacie:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'pharmacie:dispense');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'pharmacie:stock');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'plateau:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'plateau:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'plateau:acquitter');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'bloc:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'bloc:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'export:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'export:send');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'stats:facility');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'user:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'user:write');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'user:validate');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'session:manage');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'audit:read');
INSERT INTO role_permission (role, permission) VALUES ('hopital', 'org:read');
INSERT INTO role_permission (role, permission) VALUES ('ministere', 'stats:national');
INSERT INTO role_permission (role, permission) VALUES ('ministere', 'stats:facility');
INSERT INTO role_permission (role, permission) VALUES ('ministere', 'surveillance:read');
INSERT INTO role_permission (role, permission) VALUES ('ministere', 'org:read');
INSERT INTO role_permission (role, permission) VALUES ('ministere', 'export:read');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'org:read');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'org:write');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'org:validate');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'user:read');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'user:write');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'user:validate');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'session:manage');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'audit:read');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'policy:manage');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'stats:national');
INSERT INTO role_permission (role, permission) VALUES ('admin', 'stats:facility');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'patient:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'patient:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'consultation:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'consultation:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'consultation:sign');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'prescription:validate');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'transcript:record');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'flux:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'flux:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'caisse:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'caisse:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'pharmacie:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'pharmacie:dispense');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'pharmacie:stock');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'plateau:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'plateau:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'plateau:acquitter');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'bloc:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'bloc:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'export:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'export:send');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'stats:facility');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'stats:national');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'surveillance:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'org:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'org:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'org:validate');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'user:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'user:write');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'user:validate');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'permission:manage');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'session:manage');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'audit:read');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'policy:manage');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'database:manage');
INSERT INTO role_permission (role, permission) VALUES ('super_admin', 'server:manage');

-- salle_operatoire (2)
INSERT INTO salle_operatoire (id, organization_id, code, nom, actif, created_at) VALUES ('567dc2b1-3e9f-41e5-9ed3-2dd88b28f705', '175965d8-d5ec-4197-a368-898138d55e60', 'BO-1', 'Bloc 1 — chirurgie generale', 1, '{{T+0}}');
INSERT INTO salle_operatoire (id, organization_id, code, nom, actif, created_at) VALUES ('65a4a510-e8ba-4388-92c4-da2c3e5bcced', '175965d8-d5ec-4197-a368-898138d55e60', 'BO-2', 'Bloc 2 — obstetrique', 1, '{{T+0}}');

-- sejour (9)
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('4763b9f5-464e-4179-8e57-5bb6e214b6cd', '2090d8ae-4408-4d86-9008-79f0b143fe5a', '175965d8-d5ec-4197-a368-898138d55e60', 'hospitalisation', 'en-cours', '62d62161-5681-4419-b19c-fb6636d258e5', 'Desequilibre glycemique', 'urgences', NULL, '{{T-1440}}', NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('94501a1e-9562-49fe-af64-2953ded51f68', 'd86b1be8-54f2-4471-a3a0-11fe68e2b531', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Douleurs abdominales depuis deux jours', 'domicile', NULL, '{{T-105}}', NULL, '{{T-105}}', '{{T-105}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('dd8a2fcb-956a-492c-b06f-87120c460b22', '07c9c8fc-c3c6-4f32-ba6f-80e81fc05910', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Renouvellement d ordonnance', 'domicile', NULL, '{{T-150}}', NULL, '{{T-150}}', '{{T-150}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('9a97526e-a19c-428c-9316-625109120626', '10a29842-db30-4440-b530-8e9e6415ea47', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Toux et fievre', 'domicile', NULL, '{{T-40}}', NULL, '{{T-40}}', '{{T-40}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('7624f851-da75-46c4-9b37-5cb864e7543c', '34b6adf7-2d6f-4f7b-b4fc-fb3bb1b50200', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'sorti', NULL, 'Controle de tension', 'domicile', 'parti-sans-soins', '{{T-190}}', '{{T-20}}', '{{T-190}}', '{{T-190}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('089aec23-3aca-4d4a-9295-cd5139ea6c2c', 'a1a2054c-37ca-47f9-a2df-27083460781d', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Detresse respiratoire', 'domicile', NULL, '{{T-6}}', NULL, '{{T-6}}', '{{T-6}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('7c4e8bfe-2570-4fd8-80f8-4bf7266b6841', '9482186c-ec1d-46b1-b510-ba1568f30a89', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Plaie du pied', 'domicile', NULL, '{{T-25}}', NULL, '{{T-25}}', '{{T-25}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('93f59fa4-1528-48db-95ca-70356ae18557', 'cbf2681c-f482-4bf9-b137-a9604730f7de', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'en-cours', NULL, 'Fievre depuis trois jours', 'domicile', NULL, '{{T-35}}', NULL, '{{T-35}}', '{{T-12}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('fd82222b-dfa7-4ac5-aa37-1126d7dd6d80', '4270212d-9168-41dd-9cf9-72b5255e9c9d', '175965d8-d5ec-4197-a368-898138d55e60', 'externe', 'sorti', NULL, 'Consultation prenatale du troisieme trimestre', 'domicile', 'domicile', '{{T-2880}}', '{{T-2785}}', '{{T-2880}}', '{{T-2785}}');

-- service_request (1)
INSERT INTO service_request (id, consultation_id, patient_id, label, loinc_code, category, priority, reason, status, created_at) VALUES ('53ad5e4d-f428-4951-bbb9-2e2cf11171ed', '4610e61b-2d95-4e05-a0e8-53069499e290', '4270212d-9168-41dd-9cf9-72b5255e9c9d', 'Echographie obstetricale', '11525-3', 'imaging', 'routine', 'Troisieme trimestre : presentation et liquide amniotique.', 'active', '{{T-2830}}');

-- seuil_critique (5)
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('9de3bbdd-32a6-4078-868c-1398de9af096', '175965d8-d5ec-4197-a368-898138d55e60', 'Kaliemie', 'mmol/l', 2.8, 6, 60, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('c515c01d-0f3f-424f-a5bc-a73dc30118be', '175965d8-d5ec-4197-a368-898138d55e60', 'Glycemie', 'g/l', 0.4, 4, 120, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('974d1c59-25ce-4dc9-9e51-ce245851e0e3', '175965d8-d5ec-4197-a368-898138d55e60', 'Hemoglobine', 'g/dl', 6, NULL, 480, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('78afea44-ae17-423b-9e2e-7c2cc2c41a58', '175965d8-d5ec-4197-a368-898138d55e60', 'Creatininemie', 'mg/l', NULL, 50, 480, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('26c8715c-f461-4340-af41-44ecac71f8ba', '175965d8-d5ec-4197-a368-898138d55e60', 'Goutte epaisse', 'parasites/ul', NULL, NULL, 240, NULL, NULL, '{{T+0}}');

-- transcript_segment (20)
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('34ce561b-7913-43fd-8404-49de71b0a853', '696433a7-40e3-48a6-9670-6e3e9c85651a', 1, 'clinician', 'Bonjour madame, asseyez-vous. Qu est-ce qui amene le petit Koffi aujourd hui ?', 0, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('df73110c-28a1-4967-b31e-5831127a1350', '696433a7-40e3-48a6-9670-6e3e9c85651a', 2, 'companion', 'Docteur, il a le corps chaud depuis trois jours, et il ne mange plus.', 8000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('f5772b1d-394e-46b8-b88f-bdf3ae0e4554', '696433a7-40e3-48a6-9670-6e3e9c85651a', 3, 'clinician', 'Depuis trois jours. Est-ce qu il vomit ?', 16000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('08b8d12e-f5c7-4b6e-8ee2-a98d5678152b', '696433a7-40e3-48a6-9670-6e3e9c85651a', 4, 'companion', 'Il a vomi deux fois hier soir. Mais il n a pas la diarrhee.', 24000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('28f1a746-b6c5-436e-86d1-8e1afd483d7d', '696433a7-40e3-48a6-9670-6e3e9c85651a', 5, 'clinician', 'Est-ce qu il tousse ?', 32000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('3f866b85-db1d-4cbd-90a9-018428513444', '696433a7-40e3-48a6-9670-6e3e9c85651a', 6, 'companion', 'Non, il ne tousse pas. Mais il tremble la nuit, il a des frissons.', 40000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('d52716b9-def0-40e4-a1b9-40af61c13e2a', '696433a7-40e3-48a6-9670-6e3e9c85651a', 7, 'clinician', 'D accord. Est-ce qu il dort sous moustiquaire ?', 48000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('ef9f2c80-4ac4-44f1-a848-77e504ef679e', '696433a7-40e3-48a6-9670-6e3e9c85651a', 8, 'companion', 'Parfois seulement, la moustiquaire est dechiree.', 56000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('2c67108c-7d42-4da2-9a7d-56fd8e34fcb9', '696433a7-40e3-48a6-9670-6e3e9c85651a', 9, 'clinician', 'Je vais l examiner. Sa temperature est a 39,2 degres. Le pouls est a 132.', 64000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('52061bdd-3d61-432e-926c-a95c21965eee', '696433a7-40e3-48a6-9670-6e3e9c85651a', 10, 'clinician', 'Il pese 13,5 kilos. Les conjonctives sont un peu pales.', 72000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('48d1cab7-e64e-46d3-a486-c3a9bd55382e', '696433a7-40e3-48a6-9670-6e3e9c85651a', 11, 'clinician', 'L abdomen est souple, la gorge est propre, les tympans sont normaux.', 80000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('5dccd876-aba7-4ee5-ae78-eb71ae72964a', '696433a7-40e3-48a6-9670-6e3e9c85651a', 12, 'clinician', 'Le tableau evoque fortement un paludisme simple. On va faire un test rapide, un TDR paludisme.', 88000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('6fa56f27-4d5f-4fde-8a6a-a0775da109b6', '696433a7-40e3-48a6-9670-6e3e9c85651a', 13, 'clinician', 'Je demande aussi une numeration formule sanguine pour verifier l anemie.', 96000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('2897558b-5d16-45fa-bbee-7e1dc4e09fec', '696433a7-40e3-48a6-9670-6e3e9c85651a', 14, 'clinician', 'Est-ce qu il est allergique a quelque chose ?', 104000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('e33dc38f-ee7f-4c08-a413-72cb449ea8dd', '696433a7-40e3-48a6-9670-6e3e9c85651a', 15, 'companion', 'Non, jamais eu de probleme avec les medicaments.', 112000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('ccc8b7df-c08b-480a-8a24-eab6a5d25bbb', '696433a7-40e3-48a6-9670-6e3e9c85651a', 16, 'clinician', 'Bien. Je vous prescris de l artemether lumefantrine, deux fois par jour pendant trois jours, a prendre au cours des repas.', 120000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('3b15e4c5-01ce-41d6-82cf-1c6b8d8a68eb', '696433a7-40e3-48a6-9670-6e3e9c85651a', 17, 'clinician', 'Et du paracetamol 250 milligrammes, trois fois par jour pendant trois jours pour la fievre.', 128000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('94c208ad-813e-464d-bc7a-c098e7568599', '696433a7-40e3-48a6-9670-6e3e9c85651a', 18, 'clinician', 'Faites-le boire beaucoup. Reparez la moustiquaire, c est important.', 136000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('203fa9db-312f-4ee2-85e4-3823710cb45b', '696433a7-40e3-48a6-9670-6e3e9c85651a', 19, 'clinician', 'Si il convulse, s il refuse de boire ou s il devient somnolent, revenez immediatement aux urgences.', 144000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('813df903-c475-4f8a-9813-f002c9ddb386', '696433a7-40e3-48a6-9670-6e3e9c85651a', 20, 'clinician', 'Revenez me voir dans trois jours pour un controle.', 152000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');

-- unite_soins (4)
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('976d160d-4f5d-418d-b1cb-093eb11b55a4', '175965d8-d5ec-4197-a368-898138d55e60', 'MED', 'Medecine generale', 'hospitalisation', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('ac0b0990-fc7b-4ea3-a7e1-460ee6e545b5', '175965d8-d5ec-4197-a368-898138d55e60', 'MAT', 'Maternite', 'obstetrique', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('7738bb92-edd6-4411-b1b1-28cbdf1c85fd', '175965d8-d5ec-4197-a368-898138d55e60', 'PED', 'Pediatrie', 'pediatrie', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('ca32fc06-fc50-4a69-8cd9-652b54cb983e', '175965d8-d5ec-4197-a368-898138d55e60', 'URG', 'Urgences — observation', 'urgences', 1, '{{T+0}}');

-- user_account (5)
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('a1dae3f5-5655-4c53-9fa6-00877af4c1c1', 'super@smarthealth.local', 'd591e66b8858acadaa23d1fda5113940777ace02b6095e99f807c098ccd4cbdc180f5f19c82987be746dafefd3bcdba5295edc4f812e6a3875a8864f31805ac8', '1c3c97b09d3442d09245396337c936c5', 'scrypt', '{{T+0}}', 'Super Administrateur', NULL, 'super_admin', '38e85f18-afa1-4210-a0f7-1a691ff4d8c5', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('ba397f60-c595-405e-93da-35b6ef056893', 'admin@smarthealth.local', 'e3873d4c1cc00e0e65abe9d84285afe586b0159277f68bef6c231b0bc905b0c590f46a9bacbd93432de9b6b0ce2d0d7b9978abf9df9628b74a067e1d1eebad24', 'dc60fe1a22a6338314ad309933048b5f', 'scrypt', '{{T+0}}', 'Administrateur Plateforme', NULL, 'admin', '38e85f18-afa1-4210-a0f7-1a691ff4d8c5', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('f9ac5b2c-7e43-4ddc-a8ab-ef14b9d37d39', 'ministere@sante.bj', '920a6667e15a2d121865cad8c58e033c60b06209b3eef88185832900f2663913d48729f6906cde09790a7920fd1c28d5b1338f5c6d3f3d38071d47fe5d7a6d0d', '1461db49f767170c90290bc2fd873c97', 'scrypt', '{{T+0}}', 'Direction des Systemes d Information', NULL, 'ministere', '181848df-9fa4-441a-8038-e91c281c05d0', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('e4a85b37-6f79-45e2-b426-7d5031e0d753', 'direction@csc.bj', '84f30fa2c80d9c524e7648be8585c27efd447053dc5ff73680761fa6294d78639833e1835da575308915e9259dcc987f88b9400e75a35d535bd59ae636d8fd23', '532a5c966e6da496039cd345e6ae98fb', 'scrypt', '{{T+0}}', 'Direction du Centre de Sante', NULL, 'hopital', '175965d8-d5ec-4197-a368-898138d55e60', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('f6b33110-1754-4f42-bb11-2b107ca7631a', 'a.sossou@example.bj', '7f97bde03d75b17d3a2d91cdc60626c6d398f3087aee0cb2ce161ea42e955f4c1c71e185414a49aa0c43cf4d639b970ac685ba83115a08cd7ff0cadef3b32dae', '7edb8533eddaf73dfd1b8473d8551251', 'scrypt', '{{T+0}}', 'Ama Sossou', NULL, 'medecin', '175965d8-d5ec-4197-a368-898138d55e60', '8ade80a8-d1f7-429f-a9cc-9af2b2d9f54d', 'CNOM-BJ-4821', 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');

`;

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
INSERT INTO acquittement_critique (id, resultat_id, transmis_a, transmis_par, commentaire, transmis_le) VALUES ('3ad12bad-eae4-4ed2-a509-a1f740b82d78', '4a6697d9-18ff-4103-ba49-8d49d379151a', 'Dr Ama Sossou', 'Biologiste de garde', 'Appelee au telephone, ECG demande dans la foulee.', '{{T-112}}');

-- allergy (1)
INSERT INTO allergy (id, patient_id, substance, atc_code, category, criticality, reaction, recorded_at, source_consultation_id) VALUES ('e6a5c590-bcea-403b-a8f0-1271173b145f', '8f21faa2-a713-4d6e-9ebb-2d308507c147', 'Amoxicilline', 'J01CA04', 'medication', 'high', 'Urticaire generalisee et oedeme des levres', '{{T-432000}}', NULL);

-- article (6)
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('51ef13a2-784f-4eca-b256-9c32398c7548', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Amoxicilline', 'comprime', '500 mg', NULL, 'unite', 200, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('08300e99-fb7c-4fe4-8f51-5bd4de32d8a8', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Artemether/lumefantrine', 'comprime', '20/120 mg', NULL, 'unite', 120, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('65f8d02c-35e0-4ba7-a968-f2733049a54d', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Paracetamol', 'comprime', '500 mg', NULL, 'unite', 300, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('e433bb61-597d-4795-8e88-3051fd2845a8', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Ceftriaxone', 'injectable', '1 g', NULL, 'unite', 40, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('4a4f87bf-7856-4d72-b953-a7eb6b1c7586', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Sulfadoxine/pyrimethamine', 'comprime', '500/25 mg', NULL, 'unite', 100, 1, '{{T+0}}');
INSERT INTO article (id, organization_id, dci, forme, dosage, atc_code, unite, seuil_alerte, actif, created_at) VALUES ('8d69b861-e0b8-4661-b0e4-4c3f2b693db9', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Sels de rehydratation orale', 'sachet', NULL, NULL, 'sachet', 150, 1, '{{T+0}}');

-- audit_log (1)
INSERT INTO audit_log (id, at, actor_id, actor_label, action, entity, entity_id, patient_id, detail, ip) VALUES ('4436551f-8ef2-462a-94d5-dcceca55e0fd', '{{T+0}}', NULL, 'seed', 'create', 'dataset', NULL, NULL, 'Jeu de demonstration : 3 organisations, 5 comptes, 3 patients, 4 unites, 6 postes.', NULL);

-- checklist_bloc (7)
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('3d0d55d2-ef9e-4304-8ef6-1ed84c067262', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-induction', 'identite', 'Dr Ama Sossou', '{{T-24}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('6713f5dc-a5d1-4f14-8700-bf3a16ecaa54', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-induction', 'consentement', 'Dr Ama Sossou', '{{T-23}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('e3a65587-f434-433b-8206-45d07df4f744', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-induction', 'site-marque', 'Dr Ama Sossou', '{{T-22}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('2b0d76aa-f98b-40f2-88a6-45ac8cae85d5', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-induction', 'allergies', 'Dr Ama Sossou', '{{T-21}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('f614aca8-712a-40d7-8eb5-dcde5d32a3f1', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-induction', 'materiel', 'Dr Ama Sossou', '{{T-20}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('75c030a3-38b5-4f27-bd3d-30ddfa6b100d', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-incision', 'equipe-presentee', 'Dr Ama Sossou', '{{T-24}}');
INSERT INTO checklist_bloc (id, intervention_id, temps, point, coche_par, coche_le) VALUES ('1cbce473-3186-4f78-a366-207acf074d3d', 'fc21702d-9b63-4437-baae-3b3a5a1a754f', 'avant-incision', 'antibioprophylaxie', 'Dr Ama Sossou', '{{T-23}}');

-- consultation (2)
INSERT INTO consultation (id, patient_id, practitioner_id, status, encounter_class, reason_text, started_at, ended_at, signed_at, language, consent_recording, consent_at, location, audio_duration_s, transcript_full, analysis_json, analysis_engine, analysis_at, report_markdown, report_edited, organization_id, sejour_id, created_at, updated_at) VALUES ('82680cb6-be14-44d0-af85-7bb0016f3d89', 'c01a5917-6bcd-4d98-8559-ff09dd3dd619', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', 'in-progress', 'AMB', 'Fievre depuis trois jours', '{{T+0}}', NULL, NULL, 'fr', 1, '{{T+0}}', 'Centre de Sante de Cotonou', 0, '[Medecin] Bonjour madame, asseyez-vous. Qu est-ce qui amene le petit Koffi aujourd hui ?
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
[Medecin] Revenez me voir dans trois jours pour un controle.', NULL, NULL, NULL, NULL, 0, '92233c8b-0027-4cad-83b3-c7ed77935bb0', NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO consultation (id, patient_id, practitioner_id, status, encounter_class, reason_text, started_at, ended_at, signed_at, language, consent_recording, consent_at, location, audio_duration_s, transcript_full, analysis_json, analysis_engine, analysis_at, report_markdown, report_edited, organization_id, sejour_id, created_at, updated_at) VALUES ('ba12eab7-5466-4c26-af27-ceee2577543c', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', 'signed', 'AMB', 'Consultation prenatale du troisieme trimestre', '{{T-2880}}', '{{T-2840}}', '{{T-2825}}', 'fon', 1, '{{T-2880}}', 'Centre de Sante de Cotonou', 1140, '', NULL, NULL, NULL, NULL, 0, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '27847d9b-9dd0-45cf-aa38-d7cde8907fb4', '{{T-2880}}', '{{T-2825}}');

-- demande_examen (5)
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('433ef5f5-416d-4af0-b697-cfc5e7f08a7e', '8f21faa2-a713-4d6e-9ebb-2d308507c147', '1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'laboratoire', 'Kaliemie', NULL, 'urgente', 'validee', '{{T+0}}', '{{T+0}}', NULL, 1, '{{T+0}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('97e17c32-9ec6-44e8-bf71-e5fa182ed989', 'ca181cdd-c717-4679-af53-53c2dac0ec83', '27847d9b-9dd0-45cf-aa38-d7cde8907fb4', '41de65b4-0e4e-4788-b74e-b3ee1e352cb1', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'imagerie', 'Echographie obstetricale', NULL, 'routine', 'demandee', '{{T+0}}', NULL, NULL, 0, '{{T+0}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('b1d39c43-f264-4f00-bdf2-0a59fd2eb4e6', '8f21faa2-a713-4d6e-9ebb-2d308507c147', '1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'laboratoire', 'Glycemie', '2339-0', 'urgente', 'validee', '{{T-190}}', '{{T-175}}', 'Infirmier de garde', 1, '{{T-190}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('51b73d60-33b9-4131-a3af-7a88f1fe763c', 'ca181cdd-c717-4679-af53-53c2dac0ec83', '27847d9b-9dd0-45cf-aa38-d7cde8907fb4', NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'laboratoire', 'Hemoglobine', '718-7', 'urgente', 'resultat-disponible', '{{T-95}}', '{{T-80}}', 'Infirmier de garde', 1, '{{T-95}}');
INSERT INTO demande_examen (id, patient_id, sejour_id, service_request_id, organization_id, domaine, examen, loinc_code, priorite, etat, demandee_le, prelevee_le, preleve_par, identite_verifiee, created_at) VALUES ('9ebe2da9-73bd-4204-a183-162dfb0f99b3', 'c01a5917-6bcd-4d98-8559-ff09dd3dd619', '40bf2e4e-3e7e-4c70-8730-b5938ecc9656', NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'laboratoire', 'Goutte epaisse', '32700-7', 'urgente', 'resultat-disponible', '{{T-30}}', '{{T-25}}', 'Technicien de laboratoire', 1, '{{T-30}}');

-- diagnosis (1)
INSERT INTO diagnosis (id, consultation_id, patient_id, label, icd10_code, snomed_code, rank, certainty, confidence, rationale, created_at) VALUES ('e3ccc960-cf29-468b-abd1-6a422b3d1a9e', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'Surveillance de grossesse normale', 'Z34', '72892002', 1, 'confirmed', NULL, 'Terme concordant, tension normale, pas de signe d alerte.', '{{T-2835}}');

-- dispensation (1)
INSERT INTO dispensation (id, sejour_id, patient_id, prescription_id, organization_id, acteur_id, servi_le) VALUES ('455268fc-87f4-44cd-be89-14787b175acb', '27847d9b-9dd0-45cf-aa38-d7cde8907fb4', 'ca181cdd-c717-4679-af53-53c2dac0ec83', '2c28b8e0-7ad4-4e81-9349-efd88e8092eb', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2805}}');

-- dispensation_ligne (1)
INSERT INTO dispensation_ligne (id, dispensation_id, article_id, lot_id, numero_lot, perime_le, quantite, created_at) VALUES ('89fa79c5-6d37-45ec-aa71-3bf302c1b993', '455268fc-87f4-44cd-be89-14787b175acb', '51ef13a2-784f-4eca-b256-9c32398c7548', 'e9bbf509-6ce8-42d7-b4e0-fd4e8a8a73c1', 'AMX-2512', '{{D+21}}', 21, '{{T-2805}}');

-- facture (2)
INSERT INTO facture (id, sejour_id, organization_id, part_tiers, tiers_nom, close, created_at, updated_at) VALUES ('ea5a6460-8d51-4923-b824-633a649af001', '27847d9b-9dd0-45cf-aa38-d7cde8907fb4', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 0, NULL, 1, '{{T-2820}}', '{{T-2800}}');
INSERT INTO facture (id, sejour_id, organization_id, part_tiers, tiers_nom, close, created_at, updated_at) VALUES ('deb9d869-f729-43d3-8d45-ea2cbc5df108', '1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 20000, 'Mutuelle des producteurs de l Oueme', 0, '{{T-1440}}', '{{T-30}}');

-- facture_ligne (7)
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('b1e54ca4-f2bb-4f86-ac4d-647a2ea296f5', 'ea5a6460-8d51-4923-b824-633a649af001', 'Consultation prenatale', 1000, 1, 'programmable', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2820}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('a416ac5a-ab10-47b8-a7e0-82e5b85ccdbf', 'ea5a6460-8d51-4923-b824-633a649af001', 'Amoxicilline 500 mg (21 comprimes)', 1500, 1, 'programmable', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2820}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('ed00bdb5-2362-476c-b0f8-d9a9a6afb664', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 'Consultation d urgence', 2000, 1, 'urgente', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-1440}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('243bfc5d-f13e-444d-885d-f6b943f5c333', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 'Journee d hospitalisation', 3500, 2, 'programmable', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-1440}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('a5dd14d7-2bf5-444c-8928-eaf57dfc6bd8', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 'Kaliemie', 2500, 1, 'urgente', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-180}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('16285ebb-0241-4065-90fa-d83d3848e576', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 'Glycemie', 1000, 1, 'urgente', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-180}}');
INSERT INTO facture_ligne (id, facture_id, libelle, montant, quantite, urgence, acteur_id, created_at) VALUES ('62c76fa5-e77a-42cc-bda6-c903dbfa9e43', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 'Cure de hernie inguinale', 45000, 1, 'programmable', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-60}}');

-- intervention (2)
INSERT INTO intervention (id, patient_id, sejour_id, salle_id, organization_id, geste, lateralise, lateralite, debut_prevu, fin_prevue, etat, operateur_id, entree_le, incise_le, termine_le, created_at, updated_at) VALUES ('fc21702d-9b63-4437-baae-3b3a5a1a754f', '8f21faa2-a713-4d6e-9ebb-2d308507c147', '1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', 'db6753d7-9f01-4d92-8434-d0be70c145be', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Cure de hernie inguinale', 1, 'droite', '{{T-15}}', '{{T+105}}', 'patient-au-bloc', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-25}}', NULL, NULL, '{{T+0}}', '{{T-25}}');
INSERT INTO intervention (id, patient_id, sejour_id, salle_id, organization_id, geste, lateralise, lateralite, debut_prevu, fin_prevue, etat, operateur_id, entree_le, incise_le, termine_le, created_at, updated_at) VALUES ('99361fa4-e75b-4274-8817-d12b54947012', 'ca181cdd-c717-4679-af53-53c2dac0ec83', NULL, '6a386a25-177b-428b-bfdd-ec322ff06608', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Cesarienne programmee', 0, 'sans-objet', '{{T+150}}', '{{T+240}}', 'programmee', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');

-- lit (28)
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('68a0f199-eb31-43d8-b6b7-e7606f0e3496', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-1', 'MED-01', 'occupe', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b5c366b3-b1b8-4a2b-b8f5-65765f35420b', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-1', 'MED-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('5823bca6-c5a0-4235-829f-886e70b317cc', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-2', 'MED-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('c55e09c2-786b-48b4-beeb-3edf146d31a0', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-2', 'MED-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('dd34a22e-19f1-472a-903d-2824bcaa99ad', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-3', 'MED-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('2b53e883-3227-4043-abd5-febdddca7715', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-3', 'MED-06', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('ca13040f-d195-4cc1-8d7c-64fdf0726541', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-4', 'MED-07', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b9f92e09-4198-4000-993d-54d8e45fdef8', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-4', 'MED-08', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('75d3196a-49be-4de7-af09-388547bd4353', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-5', 'MED-09', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('48bc7333-548a-41df-8ce6-c755fb340e29', 'ce17c8f6-4367-440e-b11f-ed121dfaad8c', 'MED-5', 'MED-10', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('88974bd9-584d-4350-ac56-eebc2cc3fab9', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-1', 'MAT-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('190efbcf-c1b4-49e1-a94a-8bfa3514f2bf', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-1', 'MAT-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('f6c0c1ea-2b86-4fe0-ab26-3933cca7bc91', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-2', 'MAT-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b8999a5e-1cb4-4a5b-b6c5-9c64cada5fef', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-2', 'MAT-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('624b025d-7c56-40e6-8299-622d9858fc15', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-3', 'MAT-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('a83ac9d2-de00-45a0-af09-c407740af8a2', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-3', 'MAT-06', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('bbeb4d2f-dfad-4e6d-9133-79632680e2ff', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-4', 'MAT-07', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('da45be48-d174-4552-83a3-1433869dabd6', '9a104e98-f77b-48f4-96b8-5b23aa90c1b3', 'MAT-4', 'MAT-08', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('faccdecc-8863-4d29-9ba0-52ab5d5542fd', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-1', 'PED-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b9eb0be3-2ca8-4809-b96e-f5409b6015b7', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-1', 'PED-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('a8855dd8-c7ee-47ae-bd38-d354c471a011', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-2', 'PED-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('f3d00d41-bff8-4f64-b8b9-f15f2a0c34df', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-2', 'PED-04', 'a-preparer', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('1a0ff0c7-5677-42f9-b065-591aef00ce15', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-3', 'PED-05', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('2b092727-cd60-47e7-af44-31f8d60a9129', '0822c2d4-d22d-4cf6-9e28-8e136ce464e5', 'PED-3', 'PED-06', 'libre', 1, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('b7ba9dbc-b4b0-4e14-9189-1884d4eababd', 'a3352b0a-e048-48c1-901c-0c141229f642', 'URG-1', 'URG-01', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('9aa08e77-f1e4-406e-bef9-fa81f0b46cc3', 'a3352b0a-e048-48c1-901c-0c141229f642', 'URG-1', 'URG-02', 'libre', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('5cdb5321-cc41-4385-a51e-0a499cc2d679', 'a3352b0a-e048-48c1-901c-0c141229f642', 'URG-2', 'URG-03', 'hors-service', 0, '{{T+0}}');
INSERT INTO lit (id, unite_id, chambre, code, etat, isolement, created_at) VALUES ('e43a5535-a591-4bc6-8035-731ead3757a9', 'a3352b0a-e048-48c1-901c-0c141229f642', 'URG-2', 'URG-04', 'a-preparer', 1, '{{T+0}}');

-- lot (6)
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('243f11ca-d1f4-47ea-9c83-6a8fa94ea170', '51ef13a2-784f-4eca-b256-9c32398c7548', 'AMX-2605', '{{D+420}}', 600, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('e9bbf509-6ce8-42d7-b4e0-fd4e8a8a73c1', '51ef13a2-784f-4eca-b256-9c32398c7548', 'AMX-2512', '{{D+21}}', 129, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('29961993-efc6-4d6e-9d91-76aadb59642b', '08300e99-fb7c-4fe4-8f51-5bd4de32d8a8', 'ALU-2603', '{{D+260}}', 480, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('d45f36ea-5115-40c7-87be-7bee4509c3c9', '65f8d02c-35e0-4ba7-a968-f2733049a54d', 'PAR-2611', '{{D+180}}', 300, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('4d42de88-b79f-410d-a9ed-55e2ffef5f6b', 'e433bb61-597d-4795-8e88-3051fd2845a8', 'CEF-2409', '{{D-35}}', 60, '{{T+0}}');
INSERT INTO lot (id, article_id, numero, perime_le, quantite, recu_le) VALUES ('434726c4-f10b-4429-a054-bcb7a11a4fee', '8d69b861-e0b8-4661-b0e4-4c3f2b693db9', 'SRO-2607', '{{D+540}}', 900, '{{T+0}}');

-- medication_statement (2)
INSERT INTO medication_statement (id, patient_id, drug_name, atc_code, dose, status, started_on, stopped_on, source_consultation_id) VALUES ('804cafba-d8cf-4e1e-9e81-a6f699ba6716', '8f21faa2-a713-4d6e-9ebb-2d308507c147', 'Amlodipine', 'C08CA01', '5 mg le matin', 'active', '{{D-280}}', NULL, NULL);
INSERT INTO medication_statement (id, patient_id, drug_name, atc_code, dose, status, started_on, stopped_on, source_consultation_id) VALUES ('de2a48a1-c83a-43d6-8d01-55de99ac540b', '8f21faa2-a713-4d6e-9ebb-2d308507c147', 'Metformine', 'A10BA02', '850 mg deux fois par jour', 'active', '{{D-280}}', NULL, NULL);

-- mouvement (1)
INSERT INTO mouvement (id, sejour_id, lit_id, unite_id, type, motif, acteur_id, survenu_le) VALUES ('f40867d9-bbf9-464c-bd1b-862ba464d908', '1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', '68a0f199-eb31-43d8-b6b7-e7606f0e3496', NULL, 'admission', NULL, NULL, '{{T-1440}}');

-- mouvement_stock (7)
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('fe5f1320-cfe1-491e-befd-821f54c14a9c', '243f11ca-d1f4-47ea-9c83-6a8fa94ea170', '51ef13a2-784f-4eca-b256-9c32398c7548', 'entree', 600, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('8e6a760b-93e9-448d-9b72-ff016c6209f7', 'e9bbf509-6ce8-42d7-b4e0-fd4e8a8a73c1', '51ef13a2-784f-4eca-b256-9c32398c7548', 'entree', 150, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('7aae6258-9073-4fad-9484-56e9301299e0', '29961993-efc6-4d6e-9d91-76aadb59642b', '08300e99-fb7c-4fe4-8f51-5bd4de32d8a8', 'entree', 480, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('0a5b7ee2-e4e8-4239-a4c6-d8e74b59d06f', 'd45f36ea-5115-40c7-87be-7bee4509c3c9', '65f8d02c-35e0-4ba7-a968-f2733049a54d', 'entree', 300, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('74faf851-6e80-41f8-87b3-52aa07f9bd5b', '4d42de88-b79f-410d-a9ed-55e2ffef5f6b', 'e433bb61-597d-4795-8e88-3051fd2845a8', 'entree', 60, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('aaefa008-14ca-4261-994d-ea17364e38ab', '434726c4-f10b-4429-a054-bcb7a11a4fee', '8d69b861-e0b8-4661-b0e4-4c3f2b693db9', 'entree', 900, 'Dotation initiale', NULL, '{{T+0}}');
INSERT INTO mouvement_stock (id, lot_id, article_id, type, quantite, motif, acteur_id, survenu_le) VALUES ('870fea36-a051-4bff-92e4-400f64bb77d8', 'e9bbf509-6ce8-42d7-b4e0-fd4e8a8a73c1', '51ef13a2-784f-4eca-b256-9c32398c7548', 'dispensation', -21, 'Ordonnance du 2026-10-25', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2805}}');

-- observation (5)
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('a832f962-71fb-4eda-8a1b-55f77a5dfd3d', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'vital-signs', '8480-6', 'Tension arterielle systolique', 118, NULL, 'mmHg', 'mm[Hg]', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('c40c7469-dd93-4937-a6d0-735b7c787bf2', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'vital-signs', '8462-4', 'Tension arterielle diastolique', 72, NULL, 'mmHg', 'mm[Hg]', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('8e55dddc-a058-4a70-b6a3-7e77ca46da16', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'vital-signs', '29463-7', 'Poids', 62, NULL, 'kg', 'kg', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('b174d0ce-d5e7-4959-b42e-8578c0a26e63', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'vital-signs', '11881-0', 'Hauteur uterine', 30, NULL, 'cm', 'cm', NULL, '{{T-2865}}', 'clinician', NULL);
INSERT INTO observation (id, patient_id, consultation_id, category, code_loinc, label, value_num, value_text, unit, ucum, interpretation, effective_at, source, confidence) VALUES ('31df799b-f978-4709-8927-064e75c82d53', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'vital-signs', '8310-5', 'Temperature', 36.9, NULL, 'degres C', 'Cel', NULL, '{{T-2865}}', 'clinician', NULL);

-- organization (3)
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('57622c5f-9b68-4155-a874-84e60b821693', 'platform', 'ParleDocteur', 'PD-PLATFORM', NULL, 'BJ', NULL, NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('25ccd074-4365-4d79-b38d-6bd15f9a571d', 'ministry', 'Ministere de la Sante', 'BJ-MS', '57622c5f-9b68-4155-a874-84e60b821693', 'BJ', NULL, NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');
INSERT INTO organization (id, type, name, code, parent_id, country, region, address, phone, email, status, created_at, updated_at) VALUES ('92233c8b-0027-4cad-83b3-c7ed77935bb0', 'health-center', 'Centre de Sante de Cotonou', 'BJ-LIT-CSC-001', '25ccd074-4365-4d79-b38d-6bd15f9a571d', 'BJ', 'Littoral', NULL, NULL, NULL, 'active', '{{T+0}}', '{{T+0}}');

-- paiement (3)
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('32cdc332-55d3-4f36-867d-4469a804291f', 'ea5a6460-8d51-4923-b824-633a649af001', 2500, 'especes', NULL, 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2800}}');
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('0eb06d95-2cbd-43bc-923d-26dff35653a1', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 15000, 'mobile', 'MM-240917-884213', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-1380}}');
INSERT INTO paiement (id, facture_id, montant, moyen, reference, acteur_id, recu_le) VALUES ('e18fe04e-0c88-4473-be8f-e2021bb70945', 'deb9d869-f729-43d3-8d45-ea2cbc5df108', 5000, 'especes', NULL, 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-30}}');

-- passage (7)
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('68bd6464-1f9e-4880-aea1-2e0892a82f48', 'da7d0698-de73-4c18-8bc1-464642676e58', 'd04dea0d-e992-41b3-8f75-d88309eb8eb8', 'standard', 'en-attente', '{{T-105}}', NULL, NULL, NULL, '{{T-105}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('50f3ad97-4d48-4f1b-8540-7b808022ebcd', '2a2090eb-95c3-4d13-a6d5-ef10689370eb', 'd04dea0d-e992-41b3-8f75-d88309eb8eb8', 'differable', 'en-attente', '{{T-150}}', NULL, NULL, NULL, '{{T-150}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('f4821e65-b510-4304-a008-6173efa56a27', '10ad8320-07d2-49a8-842c-e2d7a2a7e9cb', 'd04dea0d-e992-41b3-8f75-d88309eb8eb8', 'standard', 'en-attente', '{{T-40}}', NULL, NULL, NULL, '{{T-40}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('a2d24293-82db-4929-8dca-e43503c8915c', 'b4b4b162-f192-4e5a-88b6-00f02804a9a5', 'd04dea0d-e992-41b3-8f75-d88309eb8eb8', 'standard', 'parti', '{{T-190}}', NULL, '{{T-20}}', NULL, '{{T-190}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('10cdac3a-a4e4-4d07-9947-259b0a24aec8', 'e755bdd0-b56a-46cb-9f32-624b8953910e', '9bd8ff32-b907-403d-9364-80a490021d16', 'vitale', 'en-attente', '{{T-6}}', NULL, NULL, NULL, '{{T-6}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('8f2e731c-eb52-424a-a44c-65ab1572d7e1', 'bd686992-7fe4-4cf9-9e9e-2f96316b0af7', '9bd8ff32-b907-403d-9364-80a490021d16', 'standard', 'en-attente', '{{T-25}}', NULL, NULL, NULL, '{{T-25}}');
INSERT INTO passage (id, sejour_id, poste_id, gravite, etat, arrive_le, pris_en_charge_le, termine_le, acteur_id, created_at) VALUES ('5a6ead73-736d-489c-8243-c879c3b51f4d', '40bf2e4e-3e7e-4c70-8730-b5938ecc9656', 'd04dea0d-e992-41b3-8f75-d88309eb8eb8', 'urgente', 'en-cours', '{{T-35}}', '{{T-12}}', NULL, 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-35}}');

-- patient (9)
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('ca181cdd-c717-4679-af53-53c2dac0ec83', 'CSC-2026-00001', NULL, NULL, NULL, 'Adjoa', 'Kossou', '1998-04-12', 0, 'female', '+229 96 12 34 56', NULL, 'Cotonou', 'Littoral', 'BJ', 'fon', NULL, 62, NULL, 1, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-172800}}', '{{T-172800}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('c01a5917-6bcd-4d98-8559-ff09dd3dd619', 'CSC-2026-00002', NULL, NULL, NULL, 'Koffi', 'Adjovi', '2022-09-03', 0, 'male', NULL, NULL, 'Abomey-Calavi', 'Atlantique', 'BJ', 'fr', NULL, 13.5, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-64800}}', '{{T-64800}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('8f21faa2-a713-4d6e-9ebb-2d308507c147', 'CSC-2026-00003', NULL, NULL, NULL, 'Bernard', 'Houngbedji', '1957-11-20', 0, 'male', '+229 95 88 77 66', NULL, 'Porto-Novo', 'Oueme', 'BJ', 'fr', 'O+', 84, 172, 0, 1, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-432000}}', '{{T-14400}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('cd7434cd-a31a-4ed5-a655-5c33a9637bcf', 'CSC-2026-00004', NULL, NULL, NULL, 'Sika', 'Ahouansou', '1991-02-17', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-105}}', '{{T-105}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('12080947-da4d-4eaa-baba-e40c77776ce0', 'CSC-2026-00005', NULL, NULL, NULL, 'Gaston', 'Dossou', '1969-08-05', 0, 'male', NULL, NULL, 'Abomey-Calavi', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-150}}', '{{T-150}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('c1dab275-40d9-4f28-a25d-5fec5acb3a44', 'CSC-2026-00006', NULL, NULL, NULL, 'Delphine', 'Zinsou', '2017-01-24', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-40}}', '{{T-40}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('25650008-c034-419e-b638-fc8ddf7ab7ff', 'CSC-2026-00007', NULL, NULL, NULL, 'Felicite', 'Agbo', '1986-12-02', 0, 'female', NULL, NULL, 'Porto-Novo', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-190}}', '{{T-190}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('d4d7946d-c6be-483b-b9f1-4f9197097ca8', 'CSC-2026-00008', NULL, NULL, NULL, 'Rachidou', 'Bio', '1984-06-30', 0, 'male', NULL, NULL, 'Parakou', NULL, 'BJ', 'fr', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-6}}', '{{T-6}}');
INSERT INTO patient (id, mrn, national_id, insurance_id, insurance_scheme, given_name, family_name, birth_date, birth_date_estimated, gender, phone, address_line, city, district, country, preferred_language, blood_group, weight_kg, height_cm, is_pregnant, renal_impairment, hepatic_impairment, emergency_contact, photo_data_url, organization_id, created_at, updated_at) VALUES ('fb506d2b-acbf-42e3-943d-685e6a0cd357', 'CSC-2026-00009', NULL, NULL, NULL, 'Marguerite', 'Tossou', '1995-05-19', 0, 'female', NULL, NULL, 'Cotonou', NULL, 'BJ', 'fon', NULL, NULL, NULL, 0, 0, 0, NULL, NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T-25}}', '{{T-25}}');

-- poste (6)
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('ba3e3310-43cb-4125-bade-f0061392e45e', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'ACC', 'Accueil', 'accueil', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('9bd8ff32-b907-403d-9364-80a490021d16', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'TRI', 'Triage', 'triage', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('d04dea0d-e992-41b3-8f75-d88309eb8eb8', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'CONS-1', 'Consultation 1', 'consultation', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('f0af8c81-7ef8-4f70-b459-e55725d8cdff', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'CAISSE', 'Caisse', 'caisse', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('8802f0cd-9768-4a3c-a583-4a5278c5ce87', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'PHARM', 'Pharmacie', 'pharmacie', 1, '{{T+0}}');
INSERT INTO poste (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('96c13ca5-5e4b-4756-b65d-e698c1cdf405', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'LABO', 'Laboratoire', 'laboratoire', 1, '{{T+0}}');

-- practitioner (1)
INSERT INTO practitioner (id, given_name, family_name, qualification, speciality_code, license_number, email, phone, signature_svg, facility_id, created_at) VALUES ('f309b26f-63d7-404b-a315-0d30ff4a9fe0', 'Ama', 'Sossou', 'Medecin generaliste', '419772000', 'CNOM-BJ-4821', 'a.sossou@example.bj', '+229 97 00 00 00', NULL, '92233c8b-0027-4cad-83b3-c7ed77935bb0', '{{T+0}}');

-- prescription (1)
INSERT INTO prescription (id, consultation_id, patient_id, practitioner_id, status, origin, notes, safety_json, validated_by, validated_at, validation_note, cancelled_reason, qr_payload, created_at, updated_at) VALUES ('2c28b8e0-7ad4-4e81-9349-efd88e8092eb', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', 'validated', 'ai-proposed', 'Traitement preventif intermittent du paludisme, troisieme dose.', NULL, 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', '{{T-2825}}', 'Posologie verifiee, grossesse au troisieme trimestre.', NULL, NULL, '{{T-2830}}', '{{T-2825}}');

-- prescription_item (2)
INSERT INTO prescription_item (id, prescription_id, seq, drug_name, brand_name, atc_code, form, strength, dose, route, frequency, frequency_per_day, duration_days, quantity, instructions, substitution_allowed, is_essential_list, ai_confidence, ai_rationale, edited_by_clinician, created_at) VALUES ('ca64f40c-76c1-4a5a-b98b-ef97cf3f3b55', '2c28b8e0-7ad4-4e81-9349-efd88e8092eb', 1, 'Sulfadoxine/pyrimethamine', NULL, 'P01BD51', 'comprime', '500/25 mg', '3 comprimes en prise unique', 'oral', 'dose unique supervisee', 1, 1, '3 comprimes', 'A prendre devant le soignant.', 1, 1, NULL, NULL, 1, '{{T-2830}}');
INSERT INTO prescription_item (id, prescription_id, seq, drug_name, brand_name, atc_code, form, strength, dose, route, frequency, frequency_per_day, duration_days, quantity, instructions, substitution_allowed, is_essential_list, ai_confidence, ai_rationale, edited_by_clinician, created_at) VALUES ('600e2c3f-dc2d-4a1a-b7a6-8c1394f28fd0', '2c28b8e0-7ad4-4e81-9349-efd88e8092eb', 2, 'Amoxicilline', NULL, 'J01CA04', 'comprime', '500 mg', '1 comprime', 'oral', 'trois fois par jour', 3, 7, '21 comprimes', 'Pendant les repas. Aller au bout des sept jours.', 1, 1, NULL, NULL, 1, '{{T-2830}}');

-- problem (3)
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('ee34d643-93da-480f-ba98-42b7935105cd', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'Surveillance de grossesse normale', 'Z34', NULL, 'problem-list-item', 'active', NULL, '{{T-129600}}', NULL, NULL, 'confirmed');
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('655a0d77-c4fd-4a40-a902-c6ec8f9f9b9d', '8f21faa2-a713-4d6e-9ebb-2d308507c147', 'Hypertension essentielle (primitive)', 'I10', NULL, 'problem-list-item', 'active', NULL, '{{T-403200}}', NULL, NULL, 'confirmed');
INSERT INTO problem (id, patient_id, label, icd10_code, snomed_code, category, clinical_status, onset_date, recorded_at, source_consultation_id, confidence, verification_status) VALUES ('46508cab-2f51-4823-9a93-577aaf6d2f76', '8f21faa2-a713-4d6e-9ebb-2d308507c147', 'Diabete sucre de type 2', 'E11', NULL, 'problem-list-item', 'active', NULL, '{{T-403200}}', NULL, NULL, 'confirmed');

-- resultat_examen (5)
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('08637495-0093-4257-8f26-aead00a1c97c', '433ef5f5-416d-4af0-b697-cfc5e7f08a7e', 4.2, NULL, 'mmol/l', 'normal', 0, 'Automate BIO-2', '{{T-150}}', '4a6697d9-18ff-4103-ba49-8d49d379151a', 'Inversion de tube avec le lit voisin, detectee au controle d identite.');
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('4a6697d9-18ff-4103-ba49-8d49d379151a', '433ef5f5-416d-4af0-b697-cfc5e7f08a7e', 6.8, NULL, 'mmol/l', 'critique', 0, 'Automate BIO-2', '{{T-120}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('e7333419-471c-4821-9e09-9e461da6e5ac', 'b1d39c43-f264-4f00-bdf2-0a59fd2eb4e6', 1.9, NULL, 'g/l', 'normal', 0, 'Automate BIO-2', '{{T-140}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('10d84d38-c1f8-4ecf-95e1-e22324a8a9e0', '51b73d60-33b9-4131-a3af-7a88f1fe763c', 5.4, NULL, 'g/dl', 'critique', 1, 'Automate HEM-1', '{{T-20}}', NULL, NULL);
INSERT INTO resultat_examen (id, demande_id, valeur_num, valeur_texte, unite, interpretation, a_transmettre, rendu_par, rendu_le, remplace_par, motif_correction) VALUES ('f190682f-53ab-4148-accc-8a76580a6085', '9ebe2da9-73bd-4204-a183-162dfb0f99b3', 2400, 'Presence de trophozoites de Plasmodium falciparum.', 'parasites/ul', 'non-interprete', 0, 'Technicien de laboratoire', '{{T-8}}', NULL, NULL);

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
INSERT INTO salle_operatoire (id, organization_id, code, nom, actif, created_at) VALUES ('db6753d7-9f01-4d92-8434-d0be70c145be', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'BO-1', 'Bloc 1 — chirurgie generale', 1, '{{T+0}}');
INSERT INTO salle_operatoire (id, organization_id, code, nom, actif, created_at) VALUES ('6a386a25-177b-428b-bfdd-ec322ff06608', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'BO-2', 'Bloc 2 — obstetrique', 1, '{{T+0}}');

-- sejour (9)
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('1e5f8eed-2b32-4772-b41e-56ad9c2d5e59', '8f21faa2-a713-4d6e-9ebb-2d308507c147', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'hospitalisation', 'en-cours', '68a0f199-eb31-43d8-b6b7-e7606f0e3496', 'Desequilibre glycemique', 'urgences', NULL, '{{T-1440}}', NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('da7d0698-de73-4c18-8bc1-464642676e58', 'cd7434cd-a31a-4ed5-a655-5c33a9637bcf', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Douleurs abdominales depuis deux jours', 'domicile', NULL, '{{T-105}}', NULL, '{{T-105}}', '{{T-105}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('2a2090eb-95c3-4d13-a6d5-ef10689370eb', '12080947-da4d-4eaa-baba-e40c77776ce0', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Renouvellement d ordonnance', 'domicile', NULL, '{{T-150}}', NULL, '{{T-150}}', '{{T-150}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('10ad8320-07d2-49a8-842c-e2d7a2a7e9cb', 'c1dab275-40d9-4f28-a25d-5fec5acb3a44', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Toux et fievre', 'domicile', NULL, '{{T-40}}', NULL, '{{T-40}}', '{{T-40}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('b4b4b162-f192-4e5a-88b6-00f02804a9a5', '25650008-c034-419e-b638-fc8ddf7ab7ff', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'sorti', NULL, 'Controle de tension', 'domicile', 'parti-sans-soins', '{{T-190}}', '{{T-20}}', '{{T-190}}', '{{T-190}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('e755bdd0-b56a-46cb-9f32-624b8953910e', 'd4d7946d-c6be-483b-b9f1-4f9197097ca8', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Detresse respiratoire', 'domicile', NULL, '{{T-6}}', NULL, '{{T-6}}', '{{T-6}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('bd686992-7fe4-4cf9-9e9e-2f96316b0af7', 'fb506d2b-acbf-42e3-943d-685e6a0cd357', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Plaie du pied', 'domicile', NULL, '{{T-25}}', NULL, '{{T-25}}', '{{T-25}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('40bf2e4e-3e7e-4c70-8730-b5938ecc9656', 'c01a5917-6bcd-4d98-8559-ff09dd3dd619', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'en-cours', NULL, 'Fievre depuis trois jours', 'domicile', NULL, '{{T-35}}', NULL, '{{T-35}}', '{{T-12}}');
INSERT INTO sejour (id, patient_id, organization_id, type, statut, lit_id, motif, mode_entree, mode_sortie, admis_le, sorti_le, created_at, updated_at) VALUES ('27847d9b-9dd0-45cf-aa38-d7cde8907fb4', 'ca181cdd-c717-4679-af53-53c2dac0ec83', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'externe', 'sorti', NULL, 'Consultation prenatale du troisieme trimestre', 'domicile', 'domicile', '{{T-2880}}', '{{T-2785}}', '{{T-2880}}', '{{T-2785}}');

-- service_request (1)
INSERT INTO service_request (id, consultation_id, patient_id, label, loinc_code, category, priority, reason, status, created_at) VALUES ('41de65b4-0e4e-4788-b74e-b3ee1e352cb1', 'ba12eab7-5466-4c26-af27-ceee2577543c', 'ca181cdd-c717-4679-af53-53c2dac0ec83', 'Echographie obstetricale', '11525-3', 'imaging', 'routine', 'Troisieme trimestre : presentation et liquide amniotique.', 'active', '{{T-2830}}');

-- seuil_critique (5)
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('a2738413-3e5a-48c4-a04c-803a8cdbef1d', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Kaliemie', 'mmol/l', 2.8, 6, 60, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('e89d26d3-1d2a-4f70-9b87-885e2db86a8e', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Glycemie', 'g/l', 0.4, 4, 120, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('d1e1e6ba-16ee-4789-a36b-e697b20b846e', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Hemoglobine', 'g/dl', 6, NULL, 480, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('c1448a4d-b464-47c2-89ec-7bb204f227f8', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Creatininemie', 'mg/l', NULL, 50, 480, NULL, NULL, '{{T+0}}');
INSERT INTO seuil_critique (id, organization_id, examen, unite, borne_basse, borne_haute, stabilite_min, valide_par, valide_le, created_at) VALUES ('bae6ed46-7b7e-4ad1-afd5-bd8765f2aa10', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'Goutte epaisse', 'parasites/ul', NULL, NULL, 240, NULL, NULL, '{{T+0}}');

-- transcript_segment (20)
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('6a393526-150f-4547-aa19-2818ee8d1a6f', '82680cb6-be14-44d0-af85-7bb0016f3d89', 1, 'clinician', 'Bonjour madame, asseyez-vous. Qu est-ce qui amene le petit Koffi aujourd hui ?', 0, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('f6d7a421-5b32-4f10-8797-24907ed6a125', '82680cb6-be14-44d0-af85-7bb0016f3d89', 2, 'companion', 'Docteur, il a le corps chaud depuis trois jours, et il ne mange plus.', 8000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('c46b7d2a-9292-43d7-989c-19e14f97102c', '82680cb6-be14-44d0-af85-7bb0016f3d89', 3, 'clinician', 'Depuis trois jours. Est-ce qu il vomit ?', 16000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('4c47f1cf-4ee2-4366-af56-b96462378809', '82680cb6-be14-44d0-af85-7bb0016f3d89', 4, 'companion', 'Il a vomi deux fois hier soir. Mais il n a pas la diarrhee.', 24000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('26eb882c-b175-4a66-9894-1a8a9231e294', '82680cb6-be14-44d0-af85-7bb0016f3d89', 5, 'clinician', 'Est-ce qu il tousse ?', 32000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('4ce780d5-2ff8-4698-a690-208bba7e6eee', '82680cb6-be14-44d0-af85-7bb0016f3d89', 6, 'companion', 'Non, il ne tousse pas. Mais il tremble la nuit, il a des frissons.', 40000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('084e32bf-72c6-4edb-8cbe-b71b10e42e77', '82680cb6-be14-44d0-af85-7bb0016f3d89', 7, 'clinician', 'D accord. Est-ce qu il dort sous moustiquaire ?', 48000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('cd811040-cb5e-491b-99c4-0ec99665b0bd', '82680cb6-be14-44d0-af85-7bb0016f3d89', 8, 'companion', 'Parfois seulement, la moustiquaire est dechiree.', 56000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('c91a28dc-b4e5-41c5-be1e-fecb8311b4e9', '82680cb6-be14-44d0-af85-7bb0016f3d89', 9, 'clinician', 'Je vais l examiner. Sa temperature est a 39,2 degres. Le pouls est a 132.', 64000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('c846295f-b555-4c17-a043-5d2c5c1fb531', '82680cb6-be14-44d0-af85-7bb0016f3d89', 10, 'clinician', 'Il pese 13,5 kilos. Les conjonctives sont un peu pales.', 72000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('059f6820-24f5-4133-a87d-5b97780cc7b2', '82680cb6-be14-44d0-af85-7bb0016f3d89', 11, 'clinician', 'L abdomen est souple, la gorge est propre, les tympans sont normaux.', 80000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('56bb2fc2-29fc-43b7-8bf9-f0442ef3c343', '82680cb6-be14-44d0-af85-7bb0016f3d89', 12, 'clinician', 'Le tableau evoque fortement un paludisme simple. On va faire un test rapide, un TDR paludisme.', 88000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('5fee946e-3e6e-4bb1-8e8c-3e3b714da5e0', '82680cb6-be14-44d0-af85-7bb0016f3d89', 13, 'clinician', 'Je demande aussi une numeration formule sanguine pour verifier l anemie.', 96000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('4120e630-7679-4583-869a-d17b65318326', '82680cb6-be14-44d0-af85-7bb0016f3d89', 14, 'clinician', 'Est-ce qu il est allergique a quelque chose ?', 104000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('206af2e7-52fa-43a3-a8aa-91f2dc308e3d', '82680cb6-be14-44d0-af85-7bb0016f3d89', 15, 'companion', 'Non, jamais eu de probleme avec les medicaments.', 112000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('8657f839-bdd8-42f8-a5cb-49062d0f2b85', '82680cb6-be14-44d0-af85-7bb0016f3d89', 16, 'clinician', 'Bien. Je vous prescris de l artemether lumefantrine, deux fois par jour pendant trois jours, a prendre au cours des repas.', 120000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('6105d2de-8128-4ae0-afec-e7d1de38e87d', '82680cb6-be14-44d0-af85-7bb0016f3d89', 17, 'clinician', 'Et du paracetamol 250 milligrammes, trois fois par jour pendant trois jours pour la fievre.', 128000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('4e20938e-8a72-42dc-9143-738975f5797b', '82680cb6-be14-44d0-af85-7bb0016f3d89', 18, 'clinician', 'Faites-le boire beaucoup. Reparez la moustiquaire, c est important.', 136000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('09c9709c-8860-4b10-a98c-e2c98db37527', '82680cb6-be14-44d0-af85-7bb0016f3d89', 19, 'clinician', 'Si il convulse, s il refuse de boire ou s il devient somnolent, revenez immediatement aux urgences.', 144000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');
INSERT INTO transcript_segment (id, consultation_id, seq, speaker, text, start_ms, end_ms, confidence, language, is_final, speaker_source, speaker_confidence, pitch_hz, source_text, source_language, created_at) VALUES ('2528697f-1194-4b6b-a1ed-513911184a4f', '82680cb6-be14-44d0-af85-7bb0016f3d89', 20, 'clinician', 'Revenez me voir dans trois jours pour un controle.', 152000, NULL, 0.9, 'fr-FR', 1, 'auto', NULL, NULL, NULL, NULL, '{{T+0}}');

-- unite_soins (4)
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('ce17c8f6-4367-440e-b11f-ed121dfaad8c', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'MED', 'Medecine generale', 'hospitalisation', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('9a104e98-f77b-48f4-96b8-5b23aa90c1b3', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'MAT', 'Maternite', 'obstetrique', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('0822c2d4-d22d-4cf6-9e28-8e136ce464e5', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'PED', 'Pediatrie', 'pediatrie', 1, '{{T+0}}');
INSERT INTO unite_soins (id, organization_id, code, nom, categorie, actif, created_at) VALUES ('a3352b0a-e048-48c1-901c-0c141229f642', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'URG', 'Urgences — observation', 'urgences', 1, '{{T+0}}');

-- user_account (5)
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('01b00f98-9d00-466f-ab74-942eefda98b7', 'super@parledocteur.local', '55d27c4ae504c3aca6e3aef37ed63bd7b64d8e704885bc2f1153e5c0c0dc46e599cadfc6d47c76ff45e60aa890c9ae42952c8ca372426d1e5cbe55c090331c33', '11410a39e5b08d20f467b41d3562b7b5', 'scrypt', '{{T+0}}', 'Super Administrateur', NULL, 'super_admin', '57622c5f-9b68-4155-a874-84e60b821693', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('aa3da6af-eca4-4a61-9a94-12d4a37e25e1', 'admin@parledocteur.local', 'af5af0990aebbacd2a5d5d91c25ff04c26ab78c45fd030892a9f0f0c64d298688fa629bddeb1589e85dc25d39f7b622e304c46d6cd96a95b13449065f3c8f941', '3495d0a2b50fe57d88e4da85f8937ab2', 'scrypt', '{{T+0}}', 'Administrateur Plateforme', NULL, 'admin', '57622c5f-9b68-4155-a874-84e60b821693', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('b0aef53d-43e7-4acc-b333-453d580c7800', 'ministere@sante.bj', '958d063e66445d99949f3585ce6afe2a05bcede5a5e0d2154f515377393f9bc5c5d3cf12cf2b4f17ca3dbc12fc09fd0f703caef7e73b1b1b8814006088f05906', '5ca60c8e01701e24ce3c368f5f9215d2', 'scrypt', '{{T+0}}', 'Direction des Systemes d Information', NULL, 'ministere', '25ccd074-4365-4d79-b38d-6bd15f9a571d', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('8488b674-ab3c-46d8-9f13-dc42a1520fd8', 'direction@csc.bj', '2cc89a7f4a4c26a35629376726670f8ab5e52bd17dd9e042c56b33fe50ed96eaf4fc29afc1c42ed8957c8ce332b8ca1c048574f15a9cec983ab1c2b2f48acc47', 'caf1bd295bd02cf73f5436c0808fa718', 'scrypt', '{{T+0}}', 'Direction du Centre de Sante', NULL, 'hopital', '92233c8b-0027-4cad-83b3-c7ed77935bb0', NULL, NULL, 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');
INSERT INTO user_account (id, email, password_hash, password_salt, password_algo, password_changed_at, full_name, phone, role, organization_id, practitioner_id, license_number, status, must_change_password, failed_attempts, locked_until, last_login_at, validated_by, validated_at, rejection_reason, created_at, updated_at) VALUES ('f792096e-57a7-4e82-90ea-4ba0e06270f7', 'a.sossou@example.bj', '633f0782329d2e5dd2f15156493c48ca58dbd5ec8e918e46e1df20ff044802abe404eba6c47dac27e5a5b398a218da11830eaf8f184ccef8b6c0b8432b946639', 'c100968b9e4ddc540bdf70bf8570e3cb', 'scrypt', '{{T+0}}', 'Ama Sossou', NULL, 'medecin', '92233c8b-0027-4cad-83b3-c7ed77935bb0', 'f309b26f-63d7-404b-a315-0d30ff4a9fe0', 'CNOM-BJ-4821', 'active', 0, 0, NULL, NULL, NULL, NULL, NULL, '{{T+0}}', '{{T+0}}');

`;

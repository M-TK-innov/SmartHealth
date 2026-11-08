-- Table de collecte de l'enquete usagers, sur la base Postgres distante.
--
-- POURQUOI CE FICHIER EXISTE. La table a ete creee a la main dans la console,
-- puis modifiee a la main pour ajouter l'assurance sante. Rien dans le depot
-- n'en portait trace : personne ne pouvait la recreer, ni savoir pourquoi une
-- valeur etait refusee. Ce fichier n'est execute par aucun code — il est la
-- reference, et il se met a jour EN MEME TEMPS que lib/enquete/questionnaire.ts.
--
-- LES CONTRAINTES SONT LA SECONDE BARRIERE. La premiere est le module de
-- validation, qui refuse une cle ou une valeur inconnue avant d'ecrire. Celle-ci
-- tient meme si quelqu'un ecrit dans la base par un autre chemin : une valeur
-- qui n'est pas au menu du formulaire n'entre pas.
--
-- IL N'Y A NI ADRESSE IP, NI EMPREINTE, NI EN-TETE D'APPELANT. Le formulaire
-- annonce « ni nom, ni numero de telephone, ni numero de dossier » : garder a
-- cote de quoi identifier la ligne ferait de cette phrase un mensonge.

CREATE TABLE IF NOT EXISTS enquete_reponse (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recu_le timestamptz NOT NULL DEFAULT now(),

  -- Contexte, facultatif. Ne vaut pas a lui seul une reponse.
  centre text CHECK (centre IS NULL OR char_length(centre) BETWEEN 1 AND 80),

  -- Questionnaire usager. La CLE NE SUIT PAS LE NUMERO AFFICHE : q7 se pose en
  -- quatrieme position. Renommer une cle pour « faire propre » relirait les
  -- reponses deja enregistrees sous une autre question.
  q1 text CHECK (q1 IS NULL OR q1 = ANY (ARRAY['avait','oublie','perdu','aucun','plein'])),
  q2 text CHECK (q2 IS NULL OR q2 = ANY (ARRAY['non','partie','tout'])),
  q3 text CHECK (q3 IS NULL OR q3 = ANY (ARRAY['0','1','2','3','4+'])),
  q7 text CHECK (q7 IS NULL OR q7 = ANY (ARRAY['aucune','appliquee','sans-preuve','autre-motif','inconnu'])),
  q4 text CHECK (q4 IS NULL OR q4 = ANY (ARRAY['non','une','plusieurs','inconnu'])),
  q5 text CHECK (q5 IS NULL OR q5 = ANY (ARRAY['non','une','deux-trois','plus'])),
  q6 text CHECK (q6 IS NULL OR q6 = ANY (ARRAY['oui','non','sans-telephone'])),
  libre text CHECK (libre IS NULL OR char_length(libre) BETWEEN 1 AND 200),

  -- Questionnaire agent. Meme regle pour a6, qui s'affiche en A5 : a5 etait
  -- deja pris par le champ libre.
  a1 text CHECK (a1 IS NULL OR a1 = ANY (ARRAY['non','deux','trois+'])),
  a2 text CHECK (a2 IS NULL OR a2 = ANY (ARRAY['heure','demi','jour','plus'])),
  a3 text CHECK (a3 IS NULL OR a3 = ANY (ARRAY['toujours','souvent','rarement'])),
  a4 text CHECK (a4 IS NULL OR a4 = ANY (ARRAY['non','parfois','souvent'])),
  a6 text CHECK (a6 IS NULL OR a6 = ANY (ARRAY['immediat','minutes','ailleurs','sans-verification'])),
  a5 text CHECK (a5 IS NULL OR char_length(a5) BETWEEN 1 AND 200),

  -- Un formulaire ouvert puis abandonne n'est pas une reponse. Le centre est
  -- exclu du compte : il ne dit rien du parcours de la personne.
  --
  -- TOUTE QUESTION AJOUTEE DOIT ENTRER ICI, sans quoi quelqu'un qui n'y
  -- repondrait qu'a elle verrait sa reponse rejetee comme vide.
  CONSTRAINT au_moins_une_reponse
    CHECK (num_nonnulls(q1, q2, q3, q4, q5, q6, q7, libre, a1, a2, a3, a4, a5, a6) > 0)
);

-- ---------------------------------------------------------------------------
-- Migration du 8 novembre 2026 : l'assurance sante pour tous entre dans
-- l'enquete. A rejouer sur une base creee avant cette date.
--
-- ALTER TABLE enquete_reponse
--   ADD COLUMN q7 text,
--   ADD COLUMN a6 text,
--   ADD CONSTRAINT enquete_reponse_q7_check
--     CHECK (q7 IS NULL OR q7 = ANY (ARRAY['aucune','appliquee','sans-preuve','autre-motif','inconnu'])),
--   ADD CONSTRAINT enquete_reponse_a6_check
--     CHECK (a6 IS NULL OR a6 = ANY (ARRAY['immediat','minutes','ailleurs','sans-verification']));
--
-- ALTER TABLE enquete_reponse
--   DROP CONSTRAINT au_moins_une_reponse,
--   ADD CONSTRAINT au_moins_une_reponse
--     CHECK (num_nonnulls(q1, q2, q3, q4, q5, q6, q7, libre, a1, a2, a3, a4, a5, a6) > 0);

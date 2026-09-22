import { NextResponse } from 'next/server';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { blockingReason, resolveEndpoint } from '@/lib/net/store';
import type { EndpointRow } from '@/lib/net/store';
import { indexClinique, promptBiaisage } from '@/lib/transcription/clinical-lexicon';
import { normalizeKeywords } from '@/lib/transcription/keywords';
import { doitTraduire, estFrancais, resoudreSortie } from '@/lib/transcription/traduction';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Relais vers un moteur de reconnaissance vocale heberge par l'etablissement.
 *
 * Deux dorsales, un seul trajet :
 *   - `whisper` : whisper.cpp ou faster-whisper, pour une consultation en
 *     francais ;
 *   - `griot`   : service portant Griot, modele ouvert entraine sur les
 *     langues africaines, avec un ADAPTATEUR PAR LANGUE. L'adaptateur « fon »
 *     rend du TEXTE FON — un modele de reconnaissance vocale ne traduit pas.
 *     Un second etage, dans le meme service, traduit ce texte vers le francais
 *     avec un modele de traduction distinct, pour que le medecin valide dans
 *     une langue qu'il lit.
 *
 * La traduction ne remplace pas la transcription : les deux reviennent
 * ensemble. Une negation, une posologie ou une duree mal traduite se
 * propagerait au dossier, au compte rendu et a l'ordonnance sans que rien en
 * aval ne puisse la reperer. Le seul garde-fou est que le praticien ait la
 * phrase prononcee sous les yeux au moment de valider.
 *
 * Les deux partagent la categorie reseau « whisper » : elles recoivent la meme
 * chose — l'audio brut d'une consultation, ou les noms sont prononces a voix
 * haute, donc une donnee identifiante. Il serait incoherent de leur appliquer
 * des restrictions differentes ; seule l'adresse les distingue.
 *
 * L'endpoint vient de la configuration de la structure, jamais de la requete :
 * une URL fournie par le client permettrait d'exfiltrer l'audio d'une
 * consultation vers n'importe ou.
 */
type Backend = 'whisper' | 'griot';

function backendOf(value: unknown): Backend {
  return String(value ?? '').toLowerCase() === 'griot' ? 'griot' : 'whisper';
}

/** Une destination declaree pour Griot se reconnait a son libelle ou a son URL. */
const estGriot = (e: EndpointRow) => /griot/i.test(e.label) || /griot/i.test(e.url);

function selector(backend: Backend) {
  return backend === 'griot' ? estGriot : (e: EndpointRow) => !estGriot(e);
}

function endpoint(backend: Backend): { url: string; token: string | null } | null {
  const resolved = resolveEndpoint('whisper', selector(backend));
  if (resolved) {
    try {
      return { url: new URL(resolved.endpoint.url).toString(), token: resolved.secret };
    } catch {
      return null;
    }
  }
  if (blockingReason('whisper', selector(backend))) return null;

  const raw = (backend === 'griot' ? process.env.GRIOT_ENDPOINT : process.env.WHISPER_ENDPOINT)?.trim();
  if (!raw) return null;
  const token = (backend === 'griot' ? process.env.GRIOT_TOKEN : process.env.WHISPER_TOKEN)?.trim();
  try {
    return { url: new URL(raw).toString(), token: token || null };
  } catch {
    return null;
  }
}

function absent(backend: Backend): string {
  return backend === 'griot'
    ? 'Aucun serveur Griot declare. Ajoutez-le dans Administration > Reseau et serveurs, ou renseignez GRIOT_ENDPOINT.'
    : 'Aucun serveur Whisper declare. Ajoutez-le dans Administration > Reseau et serveurs.';
}

/**
 * Le service repond-il maintenant ?
 *
 * Une adresse declaree ne prouve rien. Depuis que l'application lance
 * elle-meme ses services auxiliaires, la fenetre s'ouvre pendant que Griot
 * charge encore plusieurs gigaoctets de poids : annoncer le moteur comme pret
 * ferait echouer le premier extrait, au pire moment. N'importe quelle reponse
 * HTTP suffit — meme un 404 — car elle prouve que quelqu'un ecoute.
 */
async function joignable(url: string): Promise<boolean> {
  try {
    const stop = AbortSignal.timeout(1500);
    await fetch(new URL(url).origin, { method: 'GET', signal: stop });
    return true;
  } catch {
    return false;
  }
}

export function GET(req: Request) {
  return guarded(async () => {
    await apiRequire('transcript:record');
    const backend = backendOf(new URL(req.url).searchParams.get('backend'));
    const target = endpoint(backend);
    return NextResponse.json({
      backend,
      configured: Boolean(target),
      // On expose l'origine, pas l'URL complete : un chemin peut contenir un jeton.
      endpoint: target ? new URL(target.url).origin : null,
      // Declare mais encore muet : le service demarre, ou il est tombe. Dans les
      // deux cas c'est different d'une absence de configuration, et l'enregistreur
      // doit pouvoir le dire au praticien plutot que de le laisser parler dans le vide.
      reachable: target ? await joignable(target.url) : false,
      // Destination declaree mais ecartee par les restrictions : le dire, sinon
      // l'utilisateur conclut a une panne du serveur.
      blocked: blockingReason('whisper', selector(backend)),
    });
  });
}

export function POST(req: Request) {
  return guarded(async () => {
    await apiRequire('transcript:record');

    const incoming = await req.formData();
    const backend = backendOf(incoming.get('backend'));
    const target = endpoint(backend);
    if (!target) {
      const blocked = blockingReason('whisper', selector(backend));
      return NextResponse.json(
        {
          error: blocked
            ? `Serveur de transcription ecarte par la configuration reseau. ${blocked}`
            : absent(backend),
        },
        { status: 412 },
      );
    }

    const audio = incoming.get('audio');
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Extrait audio manquant.' }, { status: 400 });
    }
    // Garde-fou : un extrait de consultation depasse rarement quelques Mo.
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Extrait audio trop volumineux.' }, { status: 413 });
    }

    const parlee = String(incoming.get('language') ?? 'fr');
    // La reconnaissance vocale sort dans la langue PARLEE : c'est un second
    // etage, distinct, qui traduit ensuite. Cette distinction commande le
    // biaisage du decodage et l'application du lexique clinique francais.
    const francais = estFrancais(parlee);

    const outgoing = new FormData();
    outgoing.append('file', audio, 'extrait.wav');
    outgoing.append('response_format', 'json');
    outgoing.append('temperature', '0');
    outgoing.append('language', parlee);
    if (backend === 'griot') {
      // Cote Griot, la langue choisit l'ADAPTATEUR a charger, pas une option de
      // decodage : « fon » designe un modele, pas une consigne.
      outgoing.append('source_language', parlee);
      // Second etage : traduire avant de rendre la main. Le service fait les
      // deux dans le meme aller-retour — un extrait tombe toutes les quelques
      // secondes, doubler les appels doublerait la latence percue.
      //
      // Rien a traduire si la consultation se tient deja en francais.
      if (doitTraduire(backend, parlee)) {
        outgoing.append('translate', '1');
        outgoing.append('target_language', 'fr');
      }
    }

    // Biaisage : on souffle au moteur les termes qu'il doit s'attendre a
    // entendre. Whisper lit `prompt`, faster-whisper `initial_prompt` ; les
    // deux champs partent, celui qui ne sert pas est ignore. Une amorce en
    // francais medical n'aiderait pas un adaptateur fon — elle le tirerait vers
    // une langue qu'il n'est pas en train de transcrire.
    if (francais) {
      const bias = promptBiaisage();
      outgoing.append('prompt', bias);
      outgoing.append('initial_prompt', bias);
    }

    try {
      const res = await fetch(target.url, {
        method: 'POST',
        headers: target.token ? { Authorization: `Bearer ${target.token}` } : undefined,
        body: outgoing,
        signal: AbortSignal.timeout(90000),
      });

      const raw = await res.text();
      if (!res.ok) {
        return NextResponse.json(
          { error: `Serveur de transcription (${backend}) : HTTP ${res.status}` },
          { status: 502 },
        );
      }

      // whisper.cpp renvoie { text }, faster-whisper parfois { segments: [...] }.
      let text = '';
      let traduction = '';
      let modeleTraduction: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        text = parsed.text ?? (parsed.segments ?? []).map((s: { text: string }) => s.text).join(' ');
        traduction = String(parsed.translation ?? '').trim();
        modeleTraduction = parsed.translation_model ?? null;
      } catch {
        text = raw;
      }

      // Normalisation : on rapproche les quasi-manques du terme canonique du
      // formulaire. Les corrections sont rendues avec le texte, jamais
      // appliquees en silence — le praticien doit pouvoir voir ce qui a bouge.
      //
      // Elle ne s'applique qu'a une sortie francaise. Passer du fon dans un
      // lexique de DCI francaises ne corrigerait rien : cela abimerait un texte
      // correct en le tirant vers des mots d'une autre langue.
      // Ce que le medecin relira, et ce qui doit rester a cote. La regle est
      // dans lib/transcription/traduction.ts, ou elle est testee.
      const sortie = resoudreSortie({ brut: text.trim(), traduction, langueParlee: parlee });

      // Le lexique clinique francais s'applique a ce qui est effectivement en
      // francais — donc aussi a une traduction, qui en beneficie.
      const { text: corrige, corrections } = estFrancais(sortie.language)
        ? normalizeKeywords(sortie.text, indexClinique())
        : { text: sortie.text, corrections: [] };

      return NextResponse.json({
        ...sortie,
        text: corrige,
        corrections,
        backend,
        translationModel: sortie.translated ? modeleTraduction : null,
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: `Serveur de transcription (${backend}) injoignable : ${
            e instanceof Error ? e.message : 'erreur reseau'
          }`,
        },
        { status: 502 },
      );
    }
  });
}

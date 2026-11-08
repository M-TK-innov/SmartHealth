'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Salle de consultation a distance, partagee par le praticien et le patient.
 *
 * UN SEUL COMPOSANT POUR LES DEUX COTES. Les ecrans different peu, et deux
 * composants jumeaux auraient diverge a la premiere correction : on aurait
 * repare la camera du praticien sans reparer celle du patient.
 *
 * QUI APPELLE QUI. Le praticien emet l'offre, le patient repond. Il faut que
 * l'un des deux commence, sinon chacun attend l'autre ; et si les deux
 * commencent, les offres se croisent et la liaison echoue. Le role n'est pas
 * choisi par le navigateur : il est rendu par le serveur, qui l'a deduit de
 * la session presentee.
 *
 * CE QUI SE VOIT QUAND RIEN NE MARCHE. Une liaison qui n'aboutit pas laisse
 * deux personnes devant un ecran noir, chacune persuadee que l'autre a un
 * probleme. L'etat de la liaison est donc affiche en toutes lettres, et
 * l'absence de relais est annoncee AVANT d'essayer plutot que decouverte
 * apres une minute d'attente.
 */

type Etat =
  | 'preparation'
  | 'attente-camera'
  | 'camera-refusee'
  | 'en-liaison'
  | 'connecte'
  | 'perdu'
  | 'termine';

const LIBELLE: Record<Etat, string> = {
  preparation: 'Preparation...',
  'attente-camera': 'Autorisez la camera et le micro',
  'camera-refusee': 'Camera ou micro refuse',
  'en-liaison': 'Mise en relation...',
  connecte: 'En communication',
  perdu: 'Liaison interrompue',
  termine: 'Consultation terminee',
};

export function Salle({
  salle,
  titre,
  sousTitre,
  relaisDisponible,
  surCloture,
}: {
  salle: string;
  titre: string;
  sousTitre?: string;
  /** Faux quand aucun relais n'est declare : la liaison hors reseau local echouera. */
  relaisDisponible: boolean;
  /** Rendu seulement cote praticien : lui seul clot la consultation. */
  surCloture?: () => void;
}) {
  const [etat, setEtat] = useState<Etat>('preparation');
  const [role, setRole] = useState<'praticien' | 'patient' | null>(null);
  const [micro, setMicro] = useState(true);
  const [camera, setCamera] = useState(true);
  const [incident, setIncident] = useState<string | null>(null);

  const local = useRef<HTMLVideoElement>(null);
  const distant = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const pair = useRef<RTCPeerConnection | null>(null);
  const curseur = useRef(0);
  const vivant = useRef(true);

  const envoyer = useCallback(
    async (charge: unknown) => {
      await fetch(`/api/teleconsultation/${salle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charge }),
      }).catch(() => {});
    },
    [salle],
  );

  useEffect(() => {
    vivant.current = true;

    async function demarrer() {
      // 1. La camera d'abord. Sans elle, rien a negocier, et demander
      //    l'autorisation APRES avoir ouvert la liaison ferait patienter
      //    l'autre devant un ecran vide.
      setEtat('attente-camera');
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        setEtat('camera-refusee');
        return;
      }
      if (!vivant.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      flux.current = media;
      if (local.current) local.current.srcObject = media;

      // 2. Le serveur dit QUI nous sommes et quels serveurs utiliser. Le
      //    navigateur ne choisit pas son role : il le recoit.
      const premiere = await fetch(`/api/teleconsultation/${salle}?depuis=0`).then((r) =>
        r.ok ? r.json() : null,
      );
      if (!premiere) {
        setIncident('Cette salle est fermee.');
        setEtat('perdu');
        return;
      }
      setRole(premiere.role);
      curseur.current = premiere.curseur ?? 0;

      const pc = new RTCPeerConnection({ iceServers: premiere.serveurs ?? [] });
      pair.current = pc;
      media.getTracks().forEach((t) => pc.addTrack(t, media));

      pc.ontrack = (e) => {
        if (distant.current) distant.current.srcObject = e.streams[0];
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) void envoyer({ type: 'candidat', candidat: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (!vivant.current) return;
        if (pc.connectionState === 'connected') setEtat('connecte');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setEtat('perdu');
        }
      };

      setEtat('en-liaison');

      // 3. Le praticien ouvre. Si les deux ouvraient, les offres se
      //    croiseraient et aucune liaison ne s'etablirait.
      if (premiere.role === 'praticien') {
        const offre = await pc.createOffer();
        await pc.setLocalDescription(offre);
        await envoyer({ type: 'offre', sdp: offre });
      }

      // 4. On releve en boucle. Un intervalle court pendant la negociation,
      //    plus long une fois connecte : continuer a interroger le serveur
      //    toutes les secondes pendant vingt minutes de consultation serait
      //    du bruit pur.
      while (vivant.current) {
        const r = await fetch(`/api/teleconsultation/${salle}?depuis=${curseur.current}`)
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null);

        if (r) {
          curseur.current = r.curseur ?? curseur.current;
          for (const m of r.messages ?? []) {
            const c = m.charge as { type?: string; sdp?: RTCSessionDescriptionInit; candidat?: RTCIceCandidateInit };
            try {
              if (c.type === 'offre' && c.sdp) {
                await pc.setRemoteDescription(c.sdp);
                const reponse = await pc.createAnswer();
                await pc.setLocalDescription(reponse);
                await envoyer({ type: 'reponse', sdp: reponse });
              } else if (c.type === 'reponse' && c.sdp) {
                await pc.setRemoteDescription(c.sdp);
              } else if (c.type === 'candidat' && c.candidat) {
                await pc.addIceCandidate(c.candidat);
              } else if (c.type === 'fin') {
                setEtat('termine');
                vivant.current = false;
              }
            } catch {
              // Un candidat tardif arrive parfois avant la description
              // distante. Le perdre est sans consequence : d'autres suivent.
            }
          }
        }
        await new Promise((r2) => setTimeout(r2, pc.connectionState === 'connected' ? 4000 : 900));
      }
    }

    void demarrer();

    return () => {
      vivant.current = false;
      flux.current?.getTracks().forEach((t) => t.stop());
      pair.current?.close();
    };
  }, [salle, envoyer]);

  function basculerMicro() {
    const piste = flux.current?.getAudioTracks()[0];
    if (!piste) return;
    piste.enabled = !piste.enabled;
    setMicro(piste.enabled);
  }

  function basculerCamera() {
    const piste = flux.current?.getVideoTracks()[0];
    if (!piste) return;
    piste.enabled = !piste.enabled;
    setCamera(piste.enabled);
  }

  async function raccrocher() {
    await envoyer({ type: 'fin' });
    vivant.current = false;
    flux.current?.getTracks().forEach((t) => t.stop());
    pair.current?.close();
    setEtat('termine');
    surCloture?.();
  }

  return (
    <div className="space-y-3">
      <header className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{titre}</h1>
            {sousTitre && <p className="text-xs text-ink-soft">{sousTitre}</p>}
          </div>
          <span
            className={`chip ${
              etat === 'connecte'
                ? 'bg-brand-soft text-brand'
                : etat === 'perdu' || etat === 'camera-refusee'
                  ? 'bg-danger-soft text-danger'
                  : ''
            }`}
          >
            {LIBELLE[etat]}
          </span>
        </div>
        {role && (
          <p className="mt-1 text-[11px] text-ink-soft">
            Vous participez en tant que {role === 'praticien' ? 'praticien' : 'patient'}.
          </p>
        )}
      </header>

      {!relaisDisponible && (
        <p className="card-pad border-l-4 border-warn text-xs leading-relaxed text-ink-soft">
          <b>Aucun relais n est configure sur ce serveur.</b> La liaison directe fonctionne entre
          deux appareils du meme reseau. Si vous etes sur des reseaux differents, l image peut ne
          jamais arriver : poursuivez par telephone plutot que d attendre.
        </p>
      )}

      {incident && (
        <p className="card-pad border-l-4 border-danger text-sm text-danger">{incident}</p>
      )}

      {etat === 'camera-refusee' && (
        <p className="card-pad border-l-4 border-danger text-xs leading-relaxed text-ink-soft">
          <b>La camera ou le micro a ete refuse.</b> Autorisez-les dans votre navigateur, puis
          rechargez cette page. Sans micro, la consultation ne peut pas avoir lieu.
        </p>
      )}

      <div className="relative overflow-hidden rounded-xl bg-ink">
        <video
          ref={distant}
          autoPlay
          playsInline
          className="aspect-video w-full bg-ink object-cover"
        />
        {etat !== 'connecte' && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-paper">
            {etat === 'termine'
              ? 'Consultation terminee.'
              : etat === 'perdu'
                ? 'La liaison ne s est pas etablie.'
                : 'En attente de votre interlocuteur...'}
          </p>
        )}
        <video
          ref={local}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 right-3 w-28 rounded-lg border border-line bg-ink object-cover shadow-lg sm:w-40"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={basculerMicro} className="btn-ghost">
          {micro ? 'Couper le micro' : 'Reactiver le micro'}
        </button>
        <button type="button" onClick={basculerCamera} className="btn-ghost">
          {camera ? 'Couper la camera' : 'Reactiver la camera'}
        </button>
        <button type="button" onClick={raccrocher} className="btn-danger ml-auto">
          Raccrocher
        </button>
      </div>
    </div>
  );
}

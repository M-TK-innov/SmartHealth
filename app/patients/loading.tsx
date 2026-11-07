import { Attente, CarteListe, Panneau } from '@/components/Squelette';

/** Meme grille que la page : liste a gauche, panneau de 380 px a droite. */
export default function Chargement() {
  return (
    <Attente quoi="Chargement de la liste des patients">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <CarteListe lignes={8} titre="w-32" />
        <Panneau champs={4} />
      </div>
    </Attente>
  );
}

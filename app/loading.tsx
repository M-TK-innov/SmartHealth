import { Attente, CarteListe } from '@/components/Squelette';

/** Attente par defaut : toute route sans squelette propre tombe ici. */
export default function Chargement() {
  return (
    <Attente quoi="Chargement de la page">
      <CarteListe lignes={5} />
    </Attente>
  );
}

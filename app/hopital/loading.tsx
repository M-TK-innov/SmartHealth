import { Attente, Compteurs, CarteListe } from '@/components/Squelette';

export default function Chargement() {
  return (
    <Attente quoi="Chargement du tableau de l hopital">
      <Compteurs n={4} />
      <CarteListe lignes={5} titre="w-36" />
    </Attente>
  );
}

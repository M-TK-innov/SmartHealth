import { Attente, CarteListe } from '@/components/Squelette';

export default function Chargement() {
  return (
    <Attente quoi="Chargement de la console d administration">
      <CarteListe lignes={6} titre="w-48" />
    </Attente>
  );
}

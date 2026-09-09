Ajoute un composant au socle. Argument : $ARGUMENTS (nom du composant).

1. Crée /mnt/$ARGUMENTS/compose.yml en suivant EXACTEMENT la forme des
   composes existants : un seul service, container_name = nom du composant,
   réseau `peaas` en external, volumes sous ./data/
2. Ne mets aucune adresse IP en dur, aucun `localhost`, aucun chemin absolu
   propre à cette VM
3. Ajoute la ligne correspondante dans /mnt/upAll
4. Montre-moi le diff avant d'écrire quoi que ce soit
Vérifie l'état du socle :
1. `docker compose ps` dans chaque dossier de composant sous /mnt
2. Les conteneurs attendus : apisix, etcd, nodered1, nodered2, solace,
   postgres, pgadmin, prometheus, grafana, webapp
3. Pour chaque conteneur absent ou non "healthy", donne les 30 dernières
   lignes de log et une hypothèse de cause
4. Confirme que tous sont bien sur le réseau `peaas`

Rends un tableau court : composant, état, remarque. Pas de commentaire général.
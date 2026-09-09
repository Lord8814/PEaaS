module.exports = {
  etcd: {
    label: "etcd",
    deps: [],
    dir: "etcd",
    service: `  etcd:
    image: quay.io/coreos/etcd:v3.5.11
    container_name: etcd
    restart: unless-stopped
    environment:
      ETCD_NAME: etcd0
      ETCD_DATA_DIR: /etcd-data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd:2380
      ETCD_INITIAL_CLUSTER: etcd0=http://etcd:2380
      ETCD_INITIAL_CLUSTER_STATE: new
      ETCD_INITIAL_CLUSTER_TOKEN: apisix-cluster
      ALLOW_NONE_AUTHENTICATION: "yes"
    volumes:
      - ./etcd/data:/etcd-data
    ports:
      - "2379:2379"
    networks:
      - peaas`
  },
  apisix: {
    label: "APISIX",
    deps: ["etcd"],
    dir: "apisix",
    service: `  apisix:
    image: apache/apisix:3.9.1-debian
    container_name: apisix
    restart: unless-stopped
    volumes:
      - ./apisix/config/config.yaml:/usr/local/apisix/conf/config.yaml:ro
    ports:
      - "9080:9080"     # entry point (appels API)
      - "9180:9180"     # admin API (creation routes/upstreams)
      - "9091:9091"     # metrics Prometheus
    networks:
      - peaas`
  },
  nodered1: {
    label: "Node-RED 1",
    deps: [],
    dir: "nodered1",
    service: `  nodered1:
    container_name: nodered1
    hostname: nodered1
    restart: unless-stopped
    image: nodered/node-red:latest
    environment:
      - TZ=Europe/Paris
    ports:
      - "1880:1880"
    volumes:
      - ./nodered1/data:/data
    networks:
      - peaas
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4g`
  },
  nodered2: {
    label: "Node-RED 2",
    deps: [],
    dir: "nodered2",
    service: `  nodered2:
    container_name: nodered2
    hostname: nodered2
    restart: unless-stopped
    image: nodered/node-red:latest
    environment:
      - TZ=Europe/Paris
    ports:
      - "1890:1880"
    volumes:
      - ./nodered2/data:/data
    networks:
      - peaas
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 4g`
  },
  solace: {
    label: "Solace",
    deps: [],
    dir: "solace",
    exclude: [
      "data/spool-cache*/**",
      "data/jail/logs/**",
      "data/var/*/.dbHistory/**"
    ],
    service: `  solace:
    image: solace/solace-pubsub-standard:latest
    container_name: solace
    restart: unless-stopped
    shm_size: 1g
    ulimits:
      core: -1
      nofile:
        soft: 1048576
        hard: 1048576
    environment:
      username_admin_globalaccesslevel: admin
      username_admin_password: admin
      system_scaling_maxconnectioncount: "100"
    volumes:
      - ./solace/data:/var/lib/solace
    ports:
      - "8080:8080"       # console admin
      - "55555:55555"     # SMF
      - "1883:1883"       # MQTT
      - "8000:8000"       # MQTT websocket
      - "5672:5672"       # AMQP
      - "9000:9000"       # REST
    networks:
      - peaas`
  },
  postgres: {
    label: "PostgreSQL",
    deps: [],
    dir: "postgres",
    service: `  postgres:
    image: postgres:16
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    volumes:
      - ./postgres/data:/var/lib/postgresql/data
    networks:
      - peaas`
  },
  pgadmin: {
    label: "pgAdmin",
    deps: ["postgres"],
    dir: "pgadmin",
    service: `  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: lord@admin.fr
      PGADMIN_DEFAULT_PASSWORD: g
      PGADMIN_CONFIG_SERVER_MODE: "False"
    ports:
      - "5433:80"
    volumes:
      - ./pgadmin/data:/var/lib/pgadmin
    networks:
      - peaas`
  },
  prometheus: {
    label: "Prometheus",
    deps: ["apisix"],
    dir: "prometheus",
    service: `  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/conf/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/data:/prometheus
    networks:
      - peaas`
  },
  grafana: {
    label: "Grafana",
    deps: ["prometheus"],
    dir: "grafana",
    service: `  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana/data:/var/lib/grafana
    networks:
      - peaas`
  }
};

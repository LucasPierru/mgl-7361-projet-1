# Architecture du Projet - MGL7361 Projet 1

## Structure des dossiers

```
projet-1/
├── primary/          # Service primaire (port 3001)
│   └── server.js     # À implémenter
├── spare/            # Service de secours (port 3002)
│   └── server.js     # À implémenter
├── proxy/            # Point d'entrée et monitoring (port 3000)
│   └── server.js     # À implémenter
├── loadtest/         # Tests de charge
│   └── spam.js       # À implémenter
├── src/              # Ancien code (référence Docker)
├── package.json      # Dépendances partagées
└── README.md         # Documentation principale
```

## Architecture des services

### 1. PRIMARY (port 3001)
- **Rôle**: Service principal qui peut simuler différents types de pannes
- **État**: `failureMode` ∈ {none, error, timeout, crash}
- **Endpoints**:
  - `GET /api` - API principale
  - `GET /health` - Health check pour le monitoring
  - `POST /fail` - Déclencher une panne
  - `POST /recover` - Récupérer après panne

### 2. SPARE (port 3002)
- **Rôle**: Service de secours (warm spare) toujours disponible
- **État**: Toujours sain
- **Endpoints**:
  - `GET /api` - API de secours
  - `GET /health` - Health check (toujours 200)

### 3. PROXY (port 3000)
- **Rôle**: Point d'entrée unique + détection de panne + routage
- **Tactiques implémentées**:
  - **Ping/Echo**: Monitoring actif du primary (500ms)
  - **Redundant Spare**: Bascule automatique vers spare
- **Endpoints**:
  - `GET /api` - Route vers primary ou spare
  - `GET /metrics` - Métriques T_bascule et E_bascule
  - `POST /inject-failure` - Déclencher panne via proxy
  - `POST /recover-primary` - Récupérer le primary

### 4. LOADTEST
- **Rôle**: Générateur de charge pour mesurer E_bascule
- **Comportement**: 10 req/sec pendant 20-30 secondes

## Métriques mesurées

### T_bascule (Temps de bascule)
Délai entre l'injection de panne et la première réponse 200 du spare.
```
T_bascule = tFirstSpare200 - tFail
```

### E_bascule (Taux d'erreurs pendant bascule)
Pourcentage de requêtes échouées dans une fenêtre autour de la panne.
```
Fenêtre: [tFail - 2s, tFail + 10s]
E_bascule = (nombre d'erreurs / total requêtes) dans la fenêtre
```

## Configuration

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| CHECK_INTERVAL_MS | 500 | Intervalle de ping/echo |
| HEALTH_TIMEOUT_MS | 400 | Timeout pour health check |
| WINDOW_BEFORE_MS | 2000 | Fenêtre avant panne pour E_bascule |
| WINDOW_AFTER_MS | 10000 | Fenêtre après panne pour E_bascule |

## Procédure de démo

1. **Démarrer les services** (3 terminaux):
   ```bash
   npm run dev:primary
   npm run dev:spare
   npm run dev:proxy
   ```

2. **Tester le routage initial**:
   ```bash
   curl http://localhost:3000/api
   # Devrait retourner node:"primary"
   ```

3. **Lancer le load test**:
   ```bash
   npm run load
   ```

4. **Déclencher la panne**:
   ```bash
   curl -X POST http://localhost:3000/inject-failure
   ```

5. **Observer les métriques**:
   ```bash
   curl http://localhost:3000/metrics
   ```

## Notes de migration depuis src/

L'ancien code dans `src/` utilisait Docker avec:
- Ports: 8080 (failover), 3001 (primary), 3002 (spare)
- Docker Compose pour orchestration
- Logique similaire mais endpoints différents

Le nouveau code utilise:
- Architecture localhost sans Docker
- Ports: 3000 (proxy), 3001 (primary), 3002 (spare)
- Endpoints standardisés selon plan académique
- Métriques T_bascule et E_bascule intégrées

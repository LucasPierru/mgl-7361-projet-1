# Architecture du Projet - MGL7361 Projet 1

## Structure des dossiers

```
projet-1/
├── primary/          # Service primaire (port 3001)
│   └── server.js
├── spare/            # Service de secours (port 3002)
│   └── server.js
├── proxy/            # Point d'entrée et monitoring (port 3000)
│   └── server.js
├── public/           # Interface web
│   └── test-client.html
├── loadtest/         # Tests de charge
│   └── spam.js
├── package.json      # Dépendances partagées
└── README.md         # Documentation principale
```

## Architecture des services

### 1. PRIMARY (port 3001)
- **Rôle**: Service principal avec émission de heartbeats et simulation de crash
- **État**: `failureMode` ∈ {none, crash}
- **Heartbeat**: Envoie POST /heartbeat au proxy toutes les 1 seconde
- **Endpoints**:
  - `GET /api` - API principale
  - `GET /status` - État actuel
  - `POST /fail` - Déclencher un crash
  - `POST /recover` - Récupérer après panne

### 2. SPARE (port 3002)
- **Rôle**: Service de secours (warm spare) toujours disponible
- **État**: Toujours sain
- **Endpoints**:
  - `GET /api` - API de secours (toujours 200)
  - `GET /status` - État actuel

### 3. PROXY (port 3000)
- **Rôle**: Point d'entrée unique + réception heartbeat + routage
- **Tactiques implémentées**:
  - **Heartbeat**: Réception passive des heartbeats du primary
  - **Redundant Spare**: Bascule automatique vers spare
- **Endpoints**:
  - `GET /api` - Route vers primary ou spare selon heartbeat
  - `GET /metrics` - Métriques T_bascule et E_bascule
  - `GET /logs?limit=N` - Historique des requêtes
  - `POST /heartbeat?from=X` - Recevoir heartbeat (appelé par primary)
  - `POST /inject-failure` - Déclencher crash du primary

### 4. UI WEB (http://localhost:3000/test-client.html)
- **Rôle**: Interface de test et démonstration
- **Onglets**:
  - **API Explorer**: Tester manuellement les endpoints
  - **Load Test**: Test automatisé avec visualisation

### 5. LOADTEST
- **Rôle**: Générateur de charge pour mesurer E_bascule
- **Comportement**: 25 req/sec pendant 30 secondes, crash à 10s

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

### Proxy (proxy/server.js)
| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| HEARTBEAT_TIMEOUT_MS | 4000 | Temps sans heartbeat avant de marquer DOWN |
| CHECK_HEARTBEAT_INTERVAL_MS | 500 | Intervalle de vérification des heartbeats |
| WINDOW_BEFORE_MS | 2000 | Fenêtre avant panne pour E_bascule |
| WINDOW_AFTER_MS | 10000 | Fenêtre après panne pour E_bascule |

### Primary (primary/server.js)
| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| HEARTBEAT_INTERVAL_MS | 1000 | Fréquence d'envoi des heartbeats |

## Flux de communication

```
PRIMARY (3001)  ----[heartbeat POST toutes les 1s]----> PROXY (3000)
                                                            |
                                                            | [vérifie fraîcheur]
                                                            | [si > 4s: DOWN]
                                                            |
Client --------[GET /api]-------> PROXY --------> PRIMARY (si heartbeat OK)
                                    |
                                    |----[si pas de heartbeat]----> SPARE (3002)
```

## Procédure de démo

1. **Démarrer les services** (3 terminaux):
   ```bash
   npm run dev:primary
   npm run dev:spare
   npm run dev:proxy
   ```

2. **Observer les heartbeats**:
   - Dans le terminal du proxy, vous verrez: `[proxy] Received heartbeat from primary at timestamp X`

3. **Tester le routage initial**:
   ```bash
   curl http://localhost:3000/api
   # Devrait retourner node:"primary"
   ```

4. **Option A - UI Web**:
   - Ouvrir http://localhost:3000/test-client.html
   - Aller dans l'onglet "Load Test"
   - Cliquer "Start Test"
   - Utiliser "Inject Failure" pour déclencher manuellement

5. **Option B - Script terminal**:
   ```bash
   npm run load
   ```

6. **Observer les métriques**:
   ```bash
   curl http://localhost:3000/metrics
   ```

7. **Redémarrer le primary**:
   ```bash
   # Dans le terminal du primary (après crash)
   npm run dev:primary
   ```

## Détection de panne (Heartbeat)

### Principe
Le primary envoie activement un signal de vie au proxy toutes les secondes. Le proxy surveille passivement la fraîcheur de ces signaux.

### Détail du mécanisme

1. **Émission (PRIMARY)**:
   - Toutes les 1 seconde: `POST /heartbeat?from=primary` vers le proxy
   - S'arrête automatiquement si le processus crashe

2. **Réception (PROXY)**:
   - Enregistre le timestamp de chaque heartbeat reçu
   - Log: `"Received heartbeat from primary at timestamp X"`

3. **Surveillance (PROXY)**:
   - Toutes les 500ms: vérifie l'âge du dernier heartbeat
   - Si `(now - lastHeartbeat) > 4000ms`: marque primary comme DOWN
   - Log: `"Primary is DOWN (no heartbeat for Xms)"`

4. **Bascule (PROXY)**:
   - Dès que primary DOWN: route toutes les requêtes vers spare
   - Transparente pour les clients

## Notes

- Le système utilise une architecture localhost sans Docker
- Les heartbeats s'arrêtent automatiquement en cas de crash
- Le spare est un warm spare (toujours démarré et prêt)
- Les métriques T_bascule et E_bascule sont calculées automatiquement

# Projet 1 MGL7361 - Preuve de Concept : Disponibilité

**Cours:** MGL7361 - Architecture Logicielle

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Tactiques de disponibilité implémentées](#tactiques-de-disponibilité-implémentées)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage du système](#démarrage-du-système)
- [Tests](#tests)
- [Scénario de démonstration](#scénario-de-démonstration)
- [Métriques](#métriques)
- [Endpoints API](#endpoints-api)

---

## Vue d'ensemble

Ce projet démontre deux tactiques de disponibilité essentielles pour les systèmes distribués :

1. **Détection de défaillance** (Heartbeat)
2. **Récupération par redondance** (Redundant Spare - Warm Spare)

Le système mesure automatiquement :
- **T_bascule** : Temps nécessaire pour basculer vers le service de secours
- **E_bascule** : Taux d'erreurs pendant la période de bascule

---

## Tactiques de disponibilité implémentées

### 1. Heartbeat (Détection de défaillance)

Le système utilise une approche de **monitoring passif** où le service primaire signale activement sa présence au proxy.

#### Fonctionnement du Heartbeat

**Phase 1 : Émission des heartbeats**
- Le service **PRIMARY** envoie un heartbeat au proxy toutes les **1 seconde**
- Chaque heartbeat est un appel `POST /heartbeat?from=primary` vers le proxy
- Le heartbeat contient uniquement un signal de vie, sans données métier

**Phase 2 : Réception et enregistrement**
- Le **PROXY** reçoit chaque heartbeat et enregistre le timestamp de réception
- Le proxy log chaque heartbeat reçu : `"Received heartbeat from primary at timestamp X"`
- Le dernier timestamp est conservé en mémoire

**Phase 3 : Surveillance de la fraîcheur**
- Le proxy vérifie l'âge du dernier heartbeat toutes les **500ms**
- Si aucun heartbeat n'a été reçu pendant **4 secondes** (4 heartbeats manqués), le primary est considéré **DOWN**
- Formule : `primaryHealthy = (now - lastHeartbeat) <= 4000ms`

**Pourquoi attendre 4 secondes (4 heartbeats manqués)?**

Le délai de 4 secondes est un **compromis entre réactivité et fiabilité** :
- **Éviter les faux positifs** : Un seul heartbeat manqué peut être dû à un retard réseau temporaire, une latence momentanée, ou une brève surcharge CPU
- **Confirmer la panne** : Attendre 4 heartbeats consécutifs manqués permet de s'assurer que le service est **vraiment DOWN** et pas juste ralenti
- **Trade-off** : Plus le délai est court, plus la détection est rapide, mais plus le risque de faux positifs augmente

**Phase 4 : Bascule automatique**
- Dès que le primary est marqué DOWN, toutes les nouvelles requêtes sont automatiquement routées vers le **SPARE**
- La bascule est transparente pour les clients
- Le proxy continue de surveiller les heartbeats pour détecter une éventuelle récupération

### 2. Redundant Spare - Warm Spare (Récupération)

- **Spare** : Service de secours toujours en marche, prêt à répondre immédiatement
- **Bascule automatique** : Dès la détection de panne, sans intervention manuelle
- **Transparence** : Le client ne voit qu'un seul point d'entrée (proxy)
- **État chaud** : Le spare est déjà démarré, pas de délai de boot

---

## Architecture

| Service | Port | Rôle | Description |
|---------|------|------|-------------|
| **PRIMARY** | 3001 | Service principal | Service normal avec heartbeat et simulation de crash |
| **SPARE** | 3002 | Service de secours | Toujours disponible (warm spare) |
| **PROXY** | 3000 | Point d'entrée | Réception heartbeat + routage + métriques + UI |

---

## Prérequis

- **Node.js** : v20.x ou supérieur
- **npm** : v10.x ou supérieur
- **nvm** (recommandé) : Pour gérer les versions de Node

### Vérification

```bash
node --version  # v20.19.0 ou supérieur
npm --version   # v10.8.2 ou supérieur
```

Si vous utilisez nvm :

```bash
nvm use 20.19.0
```

---

## Installation

**Installer les dépendances**

```bash
npm install
```

---

## Démarrage du système

**Terminal 1 - PRIMARY**
```bash
npm run dev:primary
```

**Terminal 2 - SPARE**
```bash
npm run dev:spare
```

**Terminal 3 - PROXY**
```bash
npm run dev:proxy
```

---

## Tests

Le projet offre deux méthodes de test complémentaires :

### 1. Interface Web (UI)

**Accès :** http://localhost:3000/test-client.html

#### Onglet "API Explorer"
- Interface Swagger-style pour tester manuellement chaque endpoint
- Endpoints disponibles :
  - `GET /api` : Tester le routage
  - `GET /metrics` : Voir les métriques en temps réel
  - `GET /logs` : Consulter l'historique des requêtes
  - `POST /heartbeat` : Envoyer manuellement un heartbeat (debug)
  - `POST /inject-failure` : Déclencher un crash du primary

#### Onglet "Load Test"
- **Test automatisé de 30 secondes** avec interface visuelle
- **Configuration :**
  - 25 requêtes/seconde (5 requêtes par burst, intervalles de 100-300ms)
  - Injection de panne **manuelle uniquement** via bouton "Inject Failure"
  - Sans injection manuelle, le test s'exécute pendant 30s sans panne
- **Affichage en temps réel :**
  - Logs du proxy (polling toutes les 500ms)
  - Vue en direct de chaque requête (status, backend, latency)
- **Métriques finales (après test) :**
  - Failed Requests : Nombre d'erreurs dans la fenêtre
  - Window Requests : Total de requêtes dans la fenêtre [tFail-2s, tFail+10s]
  - E_bascule : Taux d'erreurs (%)
  - T_bascule : Temps de bascule (ms)
  - Total Requests : Toutes les requêtes du test

**Avantages de l'UI :**
- Visualisation en direct du failover
- Contrôle manuel du timing d'injection
- Métriques récupérées du proxy (source of truth)
- Idéal pour les démonstrations

### 2. Script Terminal (loadtest/spam.js)

**Lancement :**
```bash
npm run load
```

#### Configuration
- **25 requêtes/seconde** (5 requêtes par burst, intervalles de 100-300ms)
- **Durée :** 30 secondes
- **Injection automatique** de panne à 10 secondes
- **Mode de panne :** Crash du primary

#### Comportement
1. Démarre le test immédiatement
2. Envoie des bursts de requêtes à intervalles aléatoires
3. Injecte automatiquement un crash à 10s
4. Mesure localement les performances
5. Affiche un résumé détaillé à la fin

#### Logs en temps réel
```
[2.0s] ✓ 200 from primary (3ms)
[2.1s] ✓ 200 from primary (2ms)
[10.0s] 💥 Failure injected on primary (crash mode)
[10.5s] ✓ 200 from spare (8ms)
[10.6s] ✓ 200 from spare (3ms)
```

#### Résumé final
```
============================================================
LOAD TEST RESULTS
============================================================

Request Statistics:
  Total requests:    750
  ✓ Successful:      735 (98.00%)
  ✗ Failed:          15

Backend Distribution:
  Primary:           250 requests
  Spare:             485 requests

Failover Timing:
  First error:       10.10s
  First spare resp:  14.10s
  Recovery delay:    4.00s

============================================================
Check detailed metrics at: http://localhost:3000/metrics
============================================================
```

**Avantages du script :**
- Reproductibilité parfaite (toujours 10s avant injection)
- Tests automatisés sans interaction
- Calculs de métriques locaux ET récupération depuis le proxy
- Idéal pour les tests de performance répétés

### Différences UI vs Script

| Aspect | UI (test-client.html) | Script (spam.js) |
|--------|----------------------|------------------|
| **Injection** | Manuelle uniquement | Automatique (10s) |
| **Visualisation** | Logs en temps réel | Logs textuels dans terminal |
| **Métriques** | Depuis proxy uniquement | Calculées localement + proxy |
| **Contrôle** | Boutons interactifs | Automatisé |
| **Usage** | Démonstrations | Tests reproductibles |
| **Charge** | 25 req/s (même config) | 25 req/s (même config) |

---

## Scénario de démonstration

### 1. Test manuel simple

#### Étape 1 : Requête normale
```bash
curl http://localhost:3000/api
# Réponse : { "node": "primary", "ok": true, ... }
```

#### Étape 2 : Injection de crash
```bash
curl -X POST http://localhost:3000/inject-failure \
  -H "Content-Type: application/json" \
  -d '{"mode":"crash"}'
```

**Ce qui se passe :**
1. Le proxy envoie la commande au primary
2. Le primary crashe immédiatement (`process.exit(1)`)
3. Les heartbeats s'arrêtent instantanément
4. Le proxy attend 4 secondes sans heartbeat
5. Le proxy bascule toutes les requêtes vers le spare

#### Étape 3 : Observer le failover (attendre 5 secondes)
```bash
curl http://localhost:3000/api
# Réponse : { "node": "spare", "ok": true, ... }
```

#### Étape 4 : Consulter les métriques
```bash
curl http://localhost:3000/metrics
```

#### Étape 5 : Redémarrer le primary manuellement
```bash
# Dans le terminal du primary
npm run dev:primary
```

**Ce qui se passe :**
1. Le primary redémarre
2. Il recommence immédiatement à envoyer des heartbeats
3. Le proxy les reçoit et marque le primary comme UP
4. Les nouvelles requêtes retournent vers le primary

---

## Métriques

### T_bascule (Temps de bascule)

**Définition :** Délai entre l'injection de panne (crash) et la première réponse 200 du spare.

```
T_bascule = tFirstSpare200 - tFail
```

**Explication :**
- Le crash stoppe immédiatement les heartbeats
- Le proxy doit attendre 4 secondes (4 heartbeats manqués) avant de déclarer le primary DOWN
- Une fois DOWN, la première requête va vers le spare
- Total : ~4 secondes + latency réseau

### E_bascule (Taux d'erreurs)

**Définition :** Pourcentage de requêtes échouées dans une fenêtre temporelle autour de la panne.

**Fenêtre :** [tFail - 2s, tFail + 10s]

```
E_bascule = (nombre d'erreurs / total requêtes dans la fenêtre) × 100
```

**Explication :**
- Pendant les 4 secondes de détection, toutes les requêtes vers le primary échouent
- À 25 req/s : environ 100 requêtes échouent pendant la fenêtre de détection
- Fenêtre de 12 secondes : ~300 requêtes totales

### Consultation des métriques

```bash
curl http://localhost:3000/metrics | python -m json.tool
```

**Exemple de réponse :**

```json
{
  "tFail": 1771750387500,
  "tFirstSpare200": 1771750391600,
  "T_bascule_ms": 4100,
  "window": {
    "before_ms": 2000,
    "after_ms": 10000
  },
  "E_bascule": 0.35,
  "counts": {
    "total": 300,
    "failed": 105
  },
  "primaryHealthy": false,
  "totalRequests": 750
}
```

**Interprétation :**
- **T_bascule** : 4100 ms (4.1 secondes) - Temps de détection + bascule
- **E_bascule** : 35% (105 erreurs sur 300 requêtes dans la fenêtre)
- **Window Requests** : 300 requêtes dans [tFail-2s, tFail+10s]
- **Total Requests** : 750 requêtes pendant tout le test (30s)

---

## Endpoints API

### Proxy (port 3000)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API principale (route vers primary ou spare selon heartbeat) |
| GET | `/metrics` | Métriques T_bascule et E_bascule |
| GET | `/logs?limit=N` | Historique des requêtes (défaut: 50) |
| POST | `/heartbeat?from=X` | Recevoir un heartbeat (normalement appelé par primary) |
| POST | `/inject-failure` | Déclencher un crash sur primary |

**Interface web :**
- `http://localhost:3000/test-client.html` : Interface de test interactive

### Primary (port 3001)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API normale (crash si failureMode = "crash") |
| GET | `/status` | État actuel du service |
| POST | `/fail` | Activer le mode crash |
| POST | `/recover` | Revenir en mode normal |

**Heartbeat automatique :**
- Envoie `POST /heartbeat?from=primary` au proxy toutes les 1 seconde
- S'arrête automatiquement en cas de crash

**Mode de panne supporté :**
- `crash` : Termine le processus (`process.exit(1)`)

### Spare (port 3002)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API de secours (toujours 200 OK) |
| GET | `/status` | État actuel du service |

---

## Structure du projet

```
mgl-7361-projet-1/
├── primary/
│   └── server.js          # Service primaire avec heartbeat et crash
├── spare/
│   └── server.js          # Service de secours (warm spare)
├── proxy/
│   └── server.js          # Proxy avec réception heartbeat et métriques
├── public/
│   └── test-client.html   # Interface web de test
├── loadtest/
│   └── spam.js            # Script de test de charge
├── package.json           # Dépendances et scripts
├── ARCHITECTURE.md        # Documentation architecture détaillée
└── README.md              # Ce fichier
```

---

## Scripts npm

```json
{
  "dev:primary": "node primary/server.js",
  "dev:spare": "node spare/server.js",
  "dev:proxy": "node proxy/server.js",
  "load": "node loadtest/spam.js"
}
```

---

## Configuration

Les paramètres sont définis dans `proxy/server.js` :

```javascript
const PRIMARY_BASE = "http://localhost:3001";
const SPARE_BASE = "http://localhost:3002";
const HEARTBEAT_TIMEOUT_MS = 4000;         // 4s sans heartbeat = DOWN
const CHECK_HEARTBEAT_INTERVAL_MS = 500;   // Vérifier toutes les 500ms
const WINDOW_BEFORE_MS = 2000;             // E_bascule window before
const WINDOW_AFTER_MS = 10000;             // E_bascule window after
```

Les paramètres dans `primary/server.js` :

```javascript
const PROXY_BASE = "http://localhost:3000";
const HEARTBEAT_INTERVAL_MS = 1000;        // Envoyer heartbeat toutes les 1s
```

---

## Troubleshooting

### Le primary ne se connecte pas au proxy

**Symptôme :** Pas de logs "Received heartbeat from primary" dans le terminal du proxy

**Solutions :**
1. Vérifier que le proxy est démarré en premier
2. Vérifier que les ports ne sont pas bloqués
3. Redémarrer le primary

### T_bascule très élevé (> 5 secondes)

**Cause :** Normal avec Heartbeat - le système attend 4 secondes (4 heartbeats manqués) avant de détecter la panne

**Explications :**
- C'est le trade-off du Heartbeat : moins de charge réseau, mais détection plus lente
- Pour une détection plus rapide, réduire `HEARTBEAT_TIMEOUT_MS` dans le proxy

### E_bascule élevé

**Cause :** Normal si le test envoie beaucoup de requêtes pendant la fenêtre de détection (4s)

**Explications :**
- À 25 req/s : environ 100 requêtes échouent pendant les 4 secondes de détection
- La fenêtre est de 12 secondes (2s avant + 10s après)
- Le taux d'erreur dépend du nombre total de requêtes dans cette fenêtre

---

## Auteur

Projet MGL7361 - Architecture Logicielle

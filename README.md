# Projet 1 MGL7361 - Preuve de Concept : Disponibilité

**Cours:** MGL7361 - Architecture Logicielle

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Tactiques de disponibilité implémentées](#tactiques-de-disponibilité-implémentées)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage du système](#démarrage-du-système)
- [Scénario de démonstration](#scénario-de-démonstration)
- [Métriques](#métriques)
- [Endpoints API](#endpoints-api)
- [Résultats](#résultats)

---

## Vue d'ensemble

Ce projet démontre deux tactiques de disponibilité essentielles pour les systèmes distribués :

1. **Détection de défaillance** (Ping/Echo)
2. **Récupération par redondance** (Redundant Spare - Warm Spare)

Le système mesure automatiquement :
- **T_bascule** : Temps nécessaire pour basculer vers le service de secours
- **E_bascule** : Taux d'erreurs pendant la période de bascule

---

## Tactiques de disponibilité implémentées

### 1. Ping/Echo (Détection de défaillance)

Le proxy monitore activement la santé du service primaire :
- **Intervalle** : 500ms
- **Timeout** : 400ms
- **Méthode** : Requête GET sur `/health`

Dès qu'une défaillance est détectée (timeout ou erreur), le système bascule automatiquement vers le spare.

### 2. Redundant Spare - Warm Spare (Récupération)

- **Spare** : Service de secours toujours en marche, prêt à répondre
- **Bascule automatique** : Sans intervention manuelle
- **Transparence** : Le client ne voit qu'un seul point d'entrée (proxy)

---

## Architecture

| Service | Port | Rôle | Description |
|---------|------|------|-------------|
| **PRIMARY** | 3001 | Service principal | Service normal qui peut simuler des pannes |
| **SPARE** | 3002 | Service de secours | Toujours disponible (warm spare) |
| **PROXY** | 3000 | Point d'entrée | Monitoring + routage + métriques |

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

### Méthode 1 : Trois terminaux

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

### Méthode 2 : Scripts individuels

```bash
# Terminal 1
node primary/server.js

# Terminal 2
node spare/server.js

# Terminal 3
node proxy/server.js
```

### Vérification

Une fois les 3 services lancés, vérifiez :

```bash
# Vérifier le proxy
curl http://localhost:3000/status

# Devrait retourner : { "primaryHealthy": true, ... }
```

---

## Scénario de démonstration

### 1. Test manuel simple

#### Étape 1 : Requête normale
```bash
curl http://localhost:3000/api
# Réponse : { "node": "primary", "ok": true, ... }
```

#### Étape 2 : Injection de panne
```bash
curl -X POST http://localhost:3000/inject-failure \
  -H "Content-Type: application/json" \
  -d '{"mode":"timeout"}'
```

#### Étape 3 : Observer le failover
```bash
# Attendre 1-2 secondes, puis :
curl http://localhost:3000/api
# Réponse : { "node": "spare", "ok": true, ... }
```

#### Étape 4 : Consulter les métriques
```bash
curl http://localhost:3000/metrics
```

### 2. Test de charge automatisé

Le script `loadtest/spam.js` exécute un scénario complet :
- Envoie 10 requêtes/seconde pendant 30 secondes
- Injecte une panne après 10 secondes
- Mesure automatiquement les performances

```bash
npm run load
```

**Résultats attendus :**
- Environ 300 requêtes totales
- ~96-97% de succès
- Failover automatique détectable
- T_bascule < 1 seconde
- E_bascule < 10%

---

## Métriques

### T_bascule (Temps de bascule)

**Définition :** Délai entre l'injection de panne et la première réponse 200 du spare.

```
T_bascule = tFirstSpare200 - tFail
```

**Résultats typiques :** 800-1200 ms

### E_bascule (Taux d'erreurs)

**Définition :** Pourcentage de requêtes échouées dans une fenêtre temporelle autour de la panne.

**Fenêtre :** [tFail - 2s, tFail + 10s]

```
E_bascule = (nombre d'erreurs / total requêtes) × 100
```

**Résultats typiques :** 5-10%

### Consultation des métriques

```bash
curl http://localhost:3000/metrics | python -m json.tool
```

**Exemple de réponse :**

```json
{
  "tFail": 1771746268736,
  "tFirstSpare200": 1771746269647,
  "T_bascule_ms": 911,
  "window": {
    "before_ms": 2000,
    "after_ms": 10000
  },
  "E_bascule": 0.07563025210084033,
  "counts": {
    "total": 119,
    "failed": 9
  },
  "primaryHealthy": false,
  "totalRequests": 303
}
```

**Interprétation :**
- **T_bascule** : 911 ms (0.911 secondes)
- **E_bascule** : 7.56% (9 erreurs sur 119 requêtes dans la fenêtre)
- **Taux de succès global** : 97% ((303-9)/303)

---

## Endpoints API

### Proxy (port 3000)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API principale (route vers primary ou spare) |
| GET | `/metrics` | Métriques T_bascule et E_bascule |
| GET | `/status` | État du proxy |
| POST | `/inject-failure` | Déclencher une panne sur primary |
| POST | `/recover-primary` | Récupérer de la panne sur le primary |

### Primary (port 3001)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API normale (selon failureMode) |
| GET | `/health` | Health check |
| GET | `/status` | État actuel |
| POST | `/fail` | Activer un mode de panne |
| POST | `/recover` | Revenir en mode normal |

**Modes de panne :**
- `none` : Fonctionnement normal
- `error` : Retourne 500
- `timeout` : Ne répond pas (timeout)
- `crash` : Termine le processus

### Spare (port 3002)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api` | API de secours (toujours 200) |
| GET | `/health` | Health check (toujours 200) |
| GET | `/status` | État actuel |

---

## Structure du projet

```
mgl-7361-projet-1/
├── primary/
│   └── server.js          # Service primaire avec simulation de pannes
├── spare/
│   └── server.js          # Service de secours (warm spare)
├── proxy/
│   └── server.js          # Proxy avec monitoring et métriques
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
const CHECK_INTERVAL_MS = 500;    // Ping/Echo interval
const HEALTH_TIMEOUT_MS = 400;    // Health check timeout
const WINDOW_BEFORE_MS = 2000;    // E_bascule window before
const WINDOW_AFTER_MS = 10000;    // E_bascule window after
```

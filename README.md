# Nexora Smart Stock AI

Plateforme indépendante et intelligente de gestion des stocks.
**Aucun Payload, aucun ORM SQL, aucun système ERP** — uniquement :

| Couche | Technologie |
|---|---|
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 + react-router 7 + Zustand + Recharts |
| Backend | Python 3.12 · FastAPI · Pydantic v2 · **PyMongo (API asynchrone native)** · JWT · Pytest |
| Base de données | **MongoDB 7.0.11 Community** (standalone, base `nexora`) |
| Temps réel | WebSockets (mouvements de stock, alertes, jobs) |
| Calculs longs | Worker séparé (prévisions, anomalies, KPIs, approvisionnement) |

```
sss-smart-stock-ai/
├── frontend/           # React + Vite (design et parcours conservés à l'identique)
│   └── src/lib/api/    # Couche API typée (VITE_API_BASE_URL) — React ne parle JAMAIS à MongoDB
├── backend/
│   ├── app/
│   │   ├── api/v1/     # auth, users, products, categories, brands, suppliers, warehouses,
│   │   │               # locations, inventory, movements, transfers, counts, purchase_orders,
│   │   │               # receipts, alerts, analytics, ai + WebSocket
│   │   ├── core/       # config, base de données (index idempotents), erreurs
│   │   ├── models/     # conventions de documents MongoDB
│   │   ├── schemas/    # Pydantic v2 (sérialisation camelCase)
│   │   ├── repositories/
│   │   ├── services/   # logique métier, opérations atomiques de stock
│   │   ├── security/   # JWT (accès court + refresh rotatif), bcrypt, RBAC 8 rôles
│   │   └── workers/    # worker de calculs longs
│   ├── scripts/seed.py # données de démo (idempotent, non destructif)
│   ├── tests/          # Pytest : RBAC, JWT, stock atomique, garde-fous anti-destructif
│   └── pyproject.toml
├── docker/             # nginx.conf, mongod.conf
├── docker-compose.yml  # mongo + backend + worker + frontend
└── README.md
```

---

## 1. Démarrage rapide sous Windows (PowerShell)

Prérequis : **Python 3.12**, **MongoDB 7.0.11 Community** installé et démarré en local, Node.js ≥ 20.19.

### 1.1 Backend

```powershell
cd C:\chemin\vers\sss-smart-stock-ai

py -3.12 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -e "backend[dev]"

copy backend\.env.example backend\.env
# → Vérifier JWT_SECRET avant toute mise en production
```

### 1.2 Vérifier MongoDB

```powershell
mongosh "mongodb://127.0.0.1:27017"
```

Puis dans `mongosh` :

```js
use nexora
db.runCommand({ ping: 1 })
```

Cette commande sélectionne la base cible **sans supprimer ni modifier** les autres bases.

### 1.3 Lancer l'API

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
```

- Santé : http://127.0.0.1:8000/api/v1/health
- Documentation interactive : http://127.0.0.1:8000/api/docs

### 1.4 Données de démonstration (idempotent, non destructif)

```powershell
python scripts\seed.py            # crée si absent
python scripts\seed.py --force    # ré-amorce les documents de démo (upsert par _id)
```

Le seed crée **8 utilisateurs de démonstration** (un par rôle, mot de passe `Demo1234!`),
2 entrepôts, 7 fournisseurs, 8 produits, 3 commandes d'achat, 5 alertes et ~6 mois
d'historique de mouvements. **Aucune donnée n'est jamais supprimée** — uniquement des
upserts filtrés par `_id`.

Comptes de démo : `admin@nexora.tn` (super_admin), `aziz.sakly@nexora.tn` (owner_ceo),
`s.benamor@nexora.tn` (stock_manager), `m.trabelsi@nexora.tn` (warehouse_employee),
`n.chatti@nexora.tn` (purchasing_manager), `y.mejri@nexora.tn` (sales_manager),
`l.hammami@nexora.tn` (commercial_user), `k.dridi@nexora.tn` (accounting_admin).

### 1.5 Frontend

```powershell
cd C:\chemin\vers\sss-smart-stock-ai\frontend
copy .env.example .env      # VITE_API_BASE_URL=http://127.0.0.1:8000
npm install
npm run dev                 # http://localhost:5173 (proxy /api → 8000)
```

### 1.6 Worker de calculs longs (terminal séparé)

```powershell
cd backend
backend\.venv\Scripts\Activate.ps1   # si venv non activé
python -m app.workers.main
```

(En dev, `WORKER_EMBEDDED=true` dans `backend\.env` évite le terminal séparé.)

### 1.7 Tests

```powershell
cd backend
pytest
```

51 tests : matrice RBAC (8 rôles), JWT (accès court/rotation/expiration),
**opérations atomiques de stock** (survente impossible, journal immuable, conflits
de version), garde-fous anti-opérations destructives, **garde-fous d'autonomie**
(zéro liaison Sage/ERP/Payload), **cycle de vente complet via HTTP**
(devis → commande → BL → stock → facture → règlements), contrats HTTP.

---

## 2. Docker (alternative)

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend (nginx) | http://localhost:8080 |
| API FastAPI | http://localhost:8000/api/v1/health |
| MongoDB | mongodb://localhost:27017 |

Le worker tourne comme service séparé (`sss-worker`).

---

## 3. Règles de sécurité MongoDB (NON NÉGOCIABLES)

Le backend ne contient et n'exécutera **jamais** :

- `dropDatabase`
- `dropCollection`
- une suppression globale sans filtre (`delete_many({})`)
- une migration destructive implicite

Enforcement :

1. **Garde-fous automatisés** — `tests/test_safety_guards.py` balaie tout le code
   source et échoue si un motif d'appel destructif apparaît.
2. **Refus de bases système** — la config refuse `admin`/`local`/`config` comme base.
3. **Désactivations réversibles** — les utilisateurs sont désactivés, jamais supprimés.
4. **Seed non destructif** — upserts filtrés par `_id` uniquement.

### Opérations critiques de stock

MongoDB **standalone** n'offre pas de transactions multi-documents : la cohérence
repose donc sur :

- **Mises à jour atomiques** `find_one_and_update` avec `{$inc: {qty, version}}`,
  **condition de version** (concurrence optimiste, retry) et **condition de
  disponibilité** (`qty >= n` pour les sorties) — la survente est impossible ;
- **Journal immuable des mouvements** (`movements`) écrit avant application puis
  marqué `applied` ou `aborted` — aucune route ne modifie ni ne supprime le journal ;
- Compteur dénormalisé `products.stock` incrémenté atomiquement, recalculable via
  `POST /api/v1/inventory/rebuild` (non destructif).

---

## 4. Authentification et RBAC

- **Access token** : JWT, durée de vie **15 minutes**.
- **Refresh token** : 7 jours, stocké uniquement **haché (SHA-256)** en base,
  **rotation à chaque usage**, révocation à la déconnexion, détection de rejeu.
- **RBAC appliqué côté serveur** (le frontend ne décide jamais des droits) —
  8 rôles identiques au type `UserRole` du frontend :

| Rôle | Droits clés |
|---|---|
| `super_admin` | tout (`*`) |
| `owner_ceo` | lecture complète, gestion utilisateurs, **approbation des achats** |
| `stock_manager` | produits/catalogue/entrepôts en écriture, mouvements, inventaires, création de commandes |
| `warehouse_employee` | lecture + mouvements d'entrée/sortie uniquement |
| `purchasing_manager` | fournisseurs + achats (écriture **et approbation**) |
| `sales_manager` | lecture + modules IA |
| `commercial_user` | lecture produits/stocks/alertes |
| `accounting_admin` | lecture globale (finance) |

---

## 5. Frontend — migration hors de Payload

Les écrans, le design et les parcours sont **conservés à l'identique**.
Payload (admin, collections, routeurs Next.js, `payload.config.ts`, `payload-types.ts`,
`@payloadcms/*`) a été **entièrement supprimé** ; le projet est désormais une SPA
Vite standard.

- **Couche API typée** : `src/lib/api/` (client avec rafraîchissement automatique du
  jeton, modules `auth`, `products`, `alerts`, `dashboard`).
- **Configuration** : `VITE_API_BASE_URL` (`.env`) ; en dev sans valeur, le proxy Vite
  transfère `/api/v1/*` vers `http://127.0.0.1:8000`.
- **Migration progressive des mocks** (`src/lib/mock-data.ts`) : les hooks
  `useProducts`, `useAlerts`, `useUnreadAlertsCount` (`src/hooks/useApi.ts`) consultent
  l'API puis **retombent sur les mocks** si le backend est indisponible (preview sans API).

État du câblage écran par écran :

| Écran | Source de données | Statut |
|---|---|---|
| Login / Register / Session | `POST /auth/login`, `/auth/register`, `/auth/me` | ✅ API |
| Produits | `GET /products` | ✅ API (repli mocks) |
| Alertes + badge sidebar | `GET /alerts` | ✅ API (repli mocks) |
| Tableau de bord, Inventaire, Entrepôts, Commandes, Fournisseurs, Analytique, Prévisions, Anomalies, Stock mort, Approvisionnement IA, Copilote, What-if | mocks | ⏳ à brancher écran par écran |

Pour brancher un écran : écrire le module API manquant dans `src/lib/api/`,
exposer un hook via `useApiResource(fetcher, fallback)`, remplacer l'import mock
dans la page, puis supprimer l'import de `mock-data.ts`.

---

## 6. Carte de l'API (`/api/v1`)

| Module | Endpoints principaux |
|---|---|
| `auth` | `POST /auth/register · /auth/login · /auth/refresh · /auth/logout`, `GET /auth/me` |
| `users` | CRUD utilisateurs + désactivation (permission `users:manage`) |
| `products` | liste filtrée (recherche, catégorie, marque, statut, entrepôt), détail, création, modification |
| `categories` / `brands` | listes dérivées du catalogue |
| `suppliers` | CRUD fournisseurs |
| `warehouses` / `locations` | entrepôts, zones, emplacements |
| `inventory` | lignes de stock, ajustement inventaire, recalcul non destructif |
| `movements` | journal (lecture), application **atomique** entrée/sortie/ajustement |
| `transfers` | transferts inter-entrepôts (deux jambes atomiques) |
| `counts` | sessions d'inventaire physique, lignes, clôture avec écarts |
| `purchase-orders` | CRUD + transitions de statut (workflow, permissions séparées) |
| `purchasing` | devis fournisseurs (comparaison d'offres), factures fournisseurs (écarts), règlements |
| `receipts` | bons de réception brouillon → validé (entrée de stock à la validation) |
| `sales` | **cycle de vente complet** : devis → commandes clients → bons de livraison → factures clients → règlements |
| `customers` | CRUD clients (code auto CLI-0001, MF, délais de paiement) |
| `media` | upload d'images produits (stockage persistant disque + référence en base) |
| `settings` | paramètres société (informations légales, devise, TVA, numérotation) + journal d'audit |
| `alerts` | liste, marquage lu, résolution |
| `analytics` | KPIs, santé du stock, CA mensuel, répartition catégories, stock mort |
| `ai` | prévisions, anomalies, recommandations (+ approbation → commande), copilote, what-if, jobs |
| `ws` | `GET /api/v1/ws?token=…` — événements `movement.created`, `alert.created`, `job.completed` |

---

## 7. Étapes d'implémentation suivies

1. ✅ Projet cloné dans un environnement local compatible Python 3.12
2. ✅ Carte Payload de Figma Make retirée (collections, admin, routeurs, dépendances)
3. ✅ Liaison Sage supprimée : zéro référence dans le code, **verrouillé par les
   tests de garde** `tests/test_autonomy_guards.py` (backend, frontend, dépendances)
   — toute réintroduction d'une intégration externe fait échouer la suite de tests
4. ✅ FastAPI avec route `/api/v1/health`
5. ✅ MongoDB configuré sans opérations destructives
6. ✅ Index MongoDB créés au démarrage (idempotents)
7. ✅ Authentification, utilisateurs et les 8 rôles
8. ✅ Produits, catégories, marques et fournisseurs
9. ✅ Entrepôts, emplacements, quantités et mouvements atomiques
10. ✅ Transferts et inventaires avec contrôle de concurrence (version + retry)
11. ✅ Commandes d'achat et réceptions (workflow + anti sur-réception)
12. ✅ Alertes, analyses et modules IA (worker séparé)
13. ✅ Couche API React typée + remplacement des mocks écran par écran (en cours)
14. ✅ Tests des workflows critiques, des permissions et de l'autonomie (51 tests)
15. ✅ Docker et documentation Windows

---

## 8. Plateforme 100 % autonome — zéro liaison Sage / ERP, zéro Payload

L'application fonctionne **intégralement en local** : API FastAPI + MongoDB +
worker + WebSocket + frontend Vite. Aucune donnée ne sort vers un système tiers,
aucune intégration n'est nécessaire :

| Fonction | Fournie par | Liaison externe |
|---|---|---|
| Authentification, RBAC 8 rôles | backend (JWT local) | aucune |
| Catalogue, stock, mouvements, transferts, inventaires | backend (MongoDB local) | aucune |
| Achats, réceptions, alertes | backend | aucune |
| Analytique & KPIs | agrégations MongoDB locales | aucune |
| Prévisions, anomalies, approvisionnement IA | worker local (calculs statistiques) | aucune |
| Temps réel | WebSocket local | aucune |

### Preuves en continu

1. **`GET /api/v1/health`** déclare publiquement l'autonomie :
   `"autonomous": true`, `"mode": "Plateforme 100 % autonome — aucune intégration
   externe"`, `"external_integrations": []`.
2. **Tests de garde** — `backend/tests/test_autonomy_guards.py` (exécutés par
   `pytest`) : balayage du code backend (`app/**`), du code frontend
   (`frontend/src/**`) et des dépendances déclarées (`pyproject.toml`,
   `package.json`). Toute réapparition d'une référence Sage / Odoo / SAP /
   Dynamics / Payload fait **échouer la suite de tests**.
3. **Vérification manuelle** :

   ```bash
   grep -rniE "\bsage\b|\bodoo\b|\bsap\b|\berp\b|payloadcms" backend/app frontend/src
   # → aucun résultat
   ```

L'ancien projet Next.js + Payload exporté de Figma Make est conservé hors du
dépôt actif à titre d'archive uniquement : il n'est plus référencé par aucun
script, aucune dépendance et aucun écran.

---

## 9. Gestion commerciale intégrée (ventes, achats, facturation)

Cycle de vente : **DEVIS → COMMANDE CLIENT → BON DE LIVRAISON → FACTURE → RÈGLEMENT**

- Numérotation atomique configurable : `DEV-2026-0001`, `CMD-…`, `BL-…`, `FAC-…`,
  `REC-…`, `DF-…`, `PO-…`, `BR-…`, `FF-…`, `REG-…` (préfixes modifiables dans
  Paramètres → Société ; aucun doublon, aucun numéro réutilisé) ;
- Machines à états serveur (transitions invalides refusées 409) + journal d'audit ;
- Le stock ne bouge QUE lors de la **validation** d'un bon de livraison (sortie)
  ou d'un bon de réception (entrée) — via mouvements atomiques, compensation
  automatique en cas d'échec, survente / sur-réception / sur-livraison impossibles ;
- Facturation bornée par les quantités **livrées** (clients) ou **reçues**
  (fournisseurs) : réservation atomique à la génération, libération à l'annulation,
  aucun doublon possible ; écarts commandé / reçu / facturé consignés ;
- Règlements partiels multiples, immuables, statuts calculés côté serveur
  (partiel / payée / en retard) ;
- 9 documents imprimables A4 professionnels (devis, commande, BL, facture,
  devis fournisseur, bon de commande, réception, facture fournisseur, reçu de
  règlement) alimentés par les **paramètres société** — aucune donnée légale
  inventée, l'administrateur saisit les informations officielles ;
- Écrans React : Articles (+ formulaire complet avec images persistantes et
  conversions d'unités), Clients, Ventes, Achats — tables filtrables, fiches
  détaillées avec navigation dans le cycle de vie, impression/PDF.

Tests d'acceptation : `backend/tests/test_commercial_flows.py` (services) et
`backend/tests/test_commercial_api.py` (cycle de vente complet via HTTP).

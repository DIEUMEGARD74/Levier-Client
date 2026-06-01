# Levier Client

Levier Client regroupe deux parties :

- le site public, destiné aux prospects et clients ;
- le cockpit privé, qui sert de poste de pilotage pour l'Agent OS commercial.

L'objectif du système est de produire une prospection B2B semi-autonome, avec recherche de prospects, enrichissement public, brouillons commerciaux, garde-fous finance et risque, puis validation humaine avant tout envoi.

## Lancement local

```powershell
npm start
```

Puis ouvrir :

- site public : `http://localhost:4288`
- cockpit privé : `http://localhost:4288/pilotage`

Le script `npm start` lance Node avec `--use-system-ca`, nécessaire sur Windows pour que les appels HTTPS vers Google Places, OpenAI et Zoho utilisent correctement les certificats système.

Raccourcis Windows :

```powershell
.\start-pilotage.ps1
```

ou double-clic sur :

```text
start-pilotage.bat
```

## Configuration

Copier `.env.example` vers `.env`, puis remplir les valeurs locales.

```powershell
Copy-Item .env.example .env
notepad .env
```

Ne jamais publier `.env`.

Variables principales :

- `OPENAI_API_KEY` pour qualifier les prospects et améliorer les messages.
- `GOOGLE_PLACES_API_KEY` pour la recherche terrain.
- `ZOHO_SMTP_USER` et `ZOHO_SMTP_PASS` pour l'envoi après validation.
- `SEND_MODE=approval` pour garder l'humain dans la boucle.
- `PARTNER_TEMPS_LIBRE_URL=https://templibre.fr/`.
- `PARTNER_MANOVASITE_URL=` à remplir lorsque ManovaSite sera en ligne.

## Règle de sécurité

Le dépôt GitHub ne doit pas contenir :

- clés API ;
- mots de passe ;
- fichier `.env` ;
- prospects réels ;
- exports contenant des données personnelles ou commerciales sensibles.

La base live reste dans `data/store.json` en local ou sur l'hébergement privé. Le dépôt contient uniquement `data/store.example.json`.

## Agent OS

Les trois piliers nommés sont :

- Nora, agent manager ;
- Claire, garde-fou finance ;
- Hugo, garde-fou risque.

Les agents opérationnels sans prénom travaillent autour de :

- recherche locale Google Places ;
- enrichissement des contacts publics ;
- analyse de sites et pages publiques ;
- rédaction commerciale ;
- signaux ManovaSite ;
- signaux Temps Libre.

Nora garde uniquement les prospects disposant d'un e-mail public exploitable. Les prospects sans e-mail sont ignorés.

## Règles d'envoi

Un e-mail ne part pas si :

- l'adresse destinataire est absente ;
- le message ne contient pas `levier-client.fr` ;
- la mention STOP manque ;
- le style contient des fautes évidentes ;
- le message contient un lien Stripe direct dans le premier contact froid.

Le lien Stripe reste disponible dans le cockpit et doit être envoyé après réponse ou validation explicite du prospect.

## Site public

Le site public vit dans `public/`.

Pages principales :

- `index.html`
- `mentions-legales.html`
- `cgu.html`
- `cgv.html`
- `confidentialite.html`

## Cockpit privé

Fichiers principaux :

- `server.js`
- `public/cockpit.html`
- `public/cockpit.js`
- `public/login.html`
- `public/login.js`
- `public/styles.css`

Le cockpit permet de consulter :

- Agent OS ;
- prospection ;
- brouillons ;
- rapports Claire et Hugo ;
- agents opérationnels ;
- liens de paiement.

Pour l'accès mobile à distance, voir `COCKPIT_DISTANCE.md`.

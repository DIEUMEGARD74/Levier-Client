# Déploiement Levier Client

Objectif :

- site public : `https://www.levier-client.fr`
- cockpit privé : `https://pilotage.levier-client.fr`
- accès mobile possible sans dépendre du PC local

## Site public

Le site public peut rester sur Cloudflare Pages.

Dossier source :

```text
public/
```

Le site public ne doit pas contenir de secrets.

## Cockpit privé

Le cockpit est une application Node.js. Il ne doit pas être hébergé comme simple site statique, car il utilise :

- OpenAI ;
- Google Places ;
- Zoho SMTP ;
- stockage local ou persistant ;
- authentification privée.

Commande de démarrage :

```text
npm start
```

En production, l'hébergeur doit lancer :

```text
node --use-system-ca server.js
```

ou utiliser le script `npm start`.

## Variables d'environnement

À configurer chez l'hébergeur :

```text
NODE_ENV=production
PORT=8080
PUBLIC_HOST=levier-client.fr
PILOT_HOST=pilotage.levier-client.fr
CASH_ADMIN_PASSWORD=<mot-de-passe-fort>
SESSION_TTL_MS=86400000
OPENAI_API_KEY=<clé OpenAI>
GOOGLE_PLACES_API_KEY=<clé Google Places>
SEND_MODE=approval
ZOHO_SMTP_HOST=smtppro.zoho.eu
ZOHO_SMTP_PORT=587
ZOHO_SMTP_USER=bonjour@levier-client.fr
ZOHO_SMTP_PASS=<mot-de-passe-application-Zoho>
MAIL_FROM=bonjour@levier-client.fr
PARTNER_TEMPS_LIBRE_URL=https://templibre.fr/
PARTNER_MANOVASITE_URL=
```

`PARTNER_MANOVASITE_URL` reste vide tant que le site n'est pas en ligne.

## DNS

Chez Cloudflare :

```text
www.levier-client.fr      vers Cloudflare Pages
levier-client.fr          redirection ou alias vers www
pilotage.levier-client.fr vers l'hébergement Node
```

Le cockpit doit toujours être protégé par HTTPS.

## Stockage

La V0 stocke les données dans :

```text
data/store.json
```

En hébergement cloud, prévoir :

- un disque persistant ;
- ou une migration vers une base distante, par exemple Postgres ou Supabase.

Ne pas committer `data/store.json` dans GitHub.

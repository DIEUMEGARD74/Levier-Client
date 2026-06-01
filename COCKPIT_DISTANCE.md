# Cockpit à distance

Objectif :

```text
https://pilotage.levier-client.fr
```

Le site public reste sur Cloudflare Pages. Le cockpit doit être hébergé comme application Node.js, car il utilise OpenAI, Google Places, Zoho SMTP, une session privée et une base locale.

## Option simple

Utiliser Render avec le dépôt GitHub `DIEUMEGARD74/Levier-Client`.

Le fichier `render.yaml` est prêt pour :

- application Node.js ;
- démarrage avec `npm start` ;
- endpoint santé `/healthz` ;
- disque persistant monté sur `/var/data` ;
- stockage cockpit dans `/var/data/store.json` ;
- variables sensibles à renseigner dans Render sans les mettre dans GitHub.

## Variables à renseigner dans Render

Valeurs sensibles :

```text
CASH_ADMIN_PASSWORD
OPENAI_API_KEY
GOOGLE_PLACES_API_KEY
ZOHO_SMTP_PASS
```

Valeurs déjà prévues dans `render.yaml` :

```text
NODE_ENV=production
DATA_DIR=/var/data
PUBLIC_HOST=levier-client.fr
PILOT_HOST=pilotage.levier-client.fr
SEND_MODE=approval
ZOHO_SMTP_HOST=smtppro.zoho.eu
ZOHO_SMTP_PORT=587
ZOHO_SMTP_USER=bonjour@levier-client.fr
MAIL_FROM=bonjour@levier-client.fr
PARTNER_TEMPS_LIBRE_URL=https://templibre.fr/
PARTNER_MANOVASITE_URL=
```

## DNS Cloudflare

Une fois le service Render créé, Render donnera une adresse du type :

```text
levier-client.onrender.com
```

Dans Cloudflare DNS, créer :

```text
Type : CNAME
Nom : pilotage
Cible : adresse Render donnée
Proxy : DNS uniquement au début
```

Ensuite ajouter `pilotage.levier-client.fr` comme domaine personnalisé dans Render.

## Contrôle final

Tester :

```text
https://pilotage.levier-client.fr/healthz
https://pilotage.levier-client.fr/connexion
https://pilotage.levier-client.fr/pilotage
```

Le PC local pourra être éteint ou en veille, le cockpit restera accessible depuis téléphone et ordinateur.

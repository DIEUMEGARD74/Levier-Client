# Référencement Levier Client

## Pourquoi Google ne trouve pas encore le site

Un site neuf n'apparaît pas immédiatement sur Google. Même si le domaine fonctionne, Google doit d'abord découvrir l'URL, explorer les pages, puis les ajouter à son index.

La recherche `site:levier-client.fr` permet de vérifier si le domaine est déjà indexé. Si aucun résultat n'apparaît, le site n'est pas encore dans l'index Google.

## Actions à faire

1. Déployer la dernière version du dossier `public/` sur Cloudflare Pages.
2. Vérifier que ces deux URL répondent bien :
   - `https://www.levier-client.fr/robots.txt`
   - `https://www.levier-client.fr/sitemap.xml`
3. Ouvrir Google Search Console.
4. Ajouter la propriété `https://www.levier-client.fr/` ou une propriété de domaine `levier-client.fr`.
5. Vérifier la propriété avec l'enregistrement DNS TXT demandé par Google.
6. Envoyer le sitemap :
   - `https://www.levier-client.fr/sitemap.xml`
7. Utiliser l'inspection d'URL sur `https://www.levier-client.fr/`.
8. Cliquer sur demander une indexation.

## Délais réalistes

Après soumission dans Google Search Console :

- indexation de la page d'accueil : souvent 24 heures à 7 jours ;
- apparition sur la recherche exacte `Levier Client` : quelques jours possibles ;
- positionnement sur des termes plus larges comme `levier client` : plus long, car l'expression est générique et concurrentielle.

## Points déjà préparés

- `robots.txt`
- `sitemap.xml`
- balise canonical
- description SEO
- Open Graph
- données structurées Schema.org

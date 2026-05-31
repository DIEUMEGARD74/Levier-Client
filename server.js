const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const tls = require("tls");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  try {
    const raw = require("fs").readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    // Local .env is optional. Production should use host-level environment variables.
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 4288);
const ADMIN_PASSWORD = process.env.CASH_ADMIN_PASSWORD || "cash-2026";
const PUBLIC_HOST = process.env.PUBLIC_HOST || "levier-client.fr";
const PILOT_HOST = process.env.PILOT_HOST || "pilotage.levier-client.fr";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const SEND_MODE = process.env.SEND_MODE || "approval";
const PROSPECTION_CITY = process.env.PROSPECTION_CITY || "Montpellier";
const PROSPECTION_DAILY_LIMIT = Number(process.env.PROSPECTION_DAILY_LIMIT || 20);
const PROSPECTION_REQUIRE_EMAIL = process.env.PROSPECTION_REQUIRE_EMAIL !== "false";
const CONTACT_LOOKUP_LIMIT = Number(process.env.CONTACT_LOOKUP_LIMIT || 5);
const CONTACT_PAGE_LIMIT = Number(process.env.CONTACT_PAGE_LIMIT || 5);
const CONTACT_FETCH_TIMEOUT_MS = Number(process.env.CONTACT_FETCH_TIMEOUT_MS || 8000);
const ZOHO_SMTP_HOST = process.env.ZOHO_SMTP_HOST || "smtppro.zoho.eu";
const ZOHO_SMTP_PORT = Number(process.env.ZOHO_SMTP_PORT || 587);
const ZOHO_SMTP_USER = process.env.ZOHO_SMTP_USER || "";
const ZOHO_SMTP_PASS = process.env.ZOHO_SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || ZOHO_SMTP_USER || "bonjour@levier-client.fr";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const STORE_FILE = path.join(ROOT, "data", "store.json");
const PUBLIC_SITE_URL = "https://www.levier-client.fr";
const OFFERS_URL = `${PUBLIC_SITE_URL}/#formules`;
const CONTACT_URL = `${PUBLIC_SITE_URL}/#contact`;
const TEMPS_LIBRE_URL = process.env.PARTNER_TEMPS_LIBRE_URL || "";
const MANOVASITE_URL = process.env.PARTNER_MANOVASITE_URL || "";
const sessions = new Map();
const loginAttempts = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function nowIso() {
  return new Date().toISOString();
}

function requiredOperationalAgents() {
  return [
    {
      role: "Veille ManovaSite - audit visuel",
      engine: "ManovaSite",
      cadence: "À chaque recherche approfondie",
      mission:
        "Repère les sites vieillissants, les visuels faibles, les textes confus, les prix mal présentés et les parcours qui peuvent freiner une demande."
    },
    {
      role: "Veille ManovaSite - offre web",
      engine: "ManovaSite",
      cadence: "À chaque recherche approfondie",
      mission:
        "Transforme les signaux web en suggestion interne pour Nora, sans envoyer de message séparé. Le lien ManovaSite n'est proposé que lorsqu'il est configuré et pertinent."
    },
    {
      role: "Veille Temps Libre - charge administrative",
      engine: "Temps Libre",
      cadence: "À chaque recherche approfondie",
      mission:
        "Repère les indices d'activité chronophage, comme réservations, demandes clients, horaires, coordination ou messages répétitifs."
    },
    {
      role: "Veille Temps Libre - agents IA",
      engine: "Temps Libre",
      cadence: "À chaque recherche approfondie",
      mission:
        "Propose à Nora un ajout discret sur les agents IA de Temps Libre quand le contexte montre un besoin de gestion de mails, rendez-vous ou suivi client."
    }
  ];
}

function ensureAgentRoster(store) {
  store.agents ||= [];
  const existing = new Set(store.agents.map((agent) => `${agent.engine}|${agent.role}`.toLowerCase()));
  for (const agent of requiredOperationalAgents()) {
    const key = `${agent.engine}|${agent.role}`.toLowerCase();
    if (!existing.has(key)) store.agents.push(agent);
  }
}

function defaultStore() {
  return {
    brand: {
      activeName: "Levier Client",
      tagline: "Des actions rapides pour rendre une offre locale plus claire, plus rassurante et plus facile à convertir.",
      nameIdeas: [
        "Levier Client",
        "levier-client.fr",
        "Audit Google",
        "Fiches produits",
        "WhatsApp",
        "Validation humaine"
      ]
    },
    pillars: {
      manager: {
        name: "Nora",
        role: "Agent manager",
        mission: "Coordonne les moteurs Audit, Fiches Produits et Arbitrage, puis prépare ta liste de décisions.",
        status: "Active",
        focus: "Prioriser les opportunités prêtes à encaisser."
      },
      finance: {
        name: "Claire",
        role: "Garde-fou finance",
        mission: "Calcule la marge, le cash engagé, le risque de perte et le seuil de rentabilité.",
        status: "Active",
        focus: "Bloquer tout ce qui ne laisse pas assez de marge nette."
      },
      risk: {
        name: "Hugo",
        role: "Garde-fou risque",
        mission: "Contrôle conformité, réputation, promesses commerciales, RGPD et produits sensibles.",
        status: "Active",
        focus: "Empêcher les actions risquées avant validation humaine."
      }
    },
    agents: [
      {
        role: "Radar local",
        engine: "Audit Google",
        cadence: "2 cycles/jour",
        mission: "Trouver des fiches Google Business faibles et préparer un angle d'approche."
      },
      {
        role: "Optimiseur fiches",
        engine: "Fiches produits",
        cadence: "1 cycle/jour",
        mission: "Repérer les annonces et boutiques mal présentées, puis produire un avant/après vendable."
      },
      {
        role: "Scanner arbitrage",
        engine: "Arbitrage",
        cadence: "3 cycles/jour",
        mission: "Repérer les écarts achat/revente avec marge nette et risque maîtrisé."
      },
      {
        role: "Rédacteur commercial",
        engine: "Tous",
        cadence: "A la demande",
        mission: "Préparer les messages, relances, audits courts et livrables client."
      }
    ],
    agentOs: {
      mode: "validation_humaine",
      objective: "Produire des prospects, brouillons et recommandations; la direction valide les envois et les liens de paiement.",
      approvalPolicy: {
        prospectingEmail: "validation_direction",
        paymentLink: "validation_direction",
        purchase: "validation_direction",
        maxSpendWithoutApproval: 0
      },
      compliance: {
        scope: "B2B cible uniquement",
        optOutText:
          "Si vous ne souhaitez plus recevoir de message de ma part, repondez simplement STOP et je supprimerai votre contact de ma liste.",
        sourceRule: "Ne contacter que des professionnels avec un message lié à leur activité."
      },
      cycles: {
        lastRun: null,
        targetDraftsPerCycle: 3
      }
    },
    metrics: {
      revenueBooked: 0,
      cashCommitted: 0,
      potentialPipeline: 515,
      lastCycle: null
    },
    prospects: [],
    outbox: [],
    opportunities: [
      {
        id: "opp-audit-001",
        type: "audit",
        title: "Audit fiche Google - restaurant local",
        target: "Restaurant indépendant",
        source: "Prospection locale",
        potentialRevenue: 99,
        cost: 0,
        riskLevel: "low",
        priority: "high",
        status: "a_valider",
        nextAction: "Envoyer le message d'approche et proposer un audit express à 99 euros.",
        notes: "Exemple de démarrage : fiche avec peu de réponses aux avis, description courte et photos anciennes.",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      {
        id: "opp-fiche-001",
        type: "fiche",
        title: "Pack 10 fiches produits - boutique artisanale",
        target: "Boutique e-commerce déco",
        source: "Recherche manuelle",
        potentialRevenue: 149,
        cost: 8,
        riskLevel: "low",
        priority: "medium",
        status: "a_valider",
        nextAction: "Envoyer un avant/après gratuit sur une fiche produit faible.",
        notes: "Promesse simple : titres, bénéfices, FAQ, mini SEO et variantes de description.",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      {
        id: "opp-arb-001",
        type: "arbitrage",
        title: "Lot objet local à revendre",
        target: "Annonce marketplace",
        source: "Arbitrage local",
        potentialRevenue: 90,
        cost: 35,
        riskLevel: "medium",
        priority: "medium",
        status: "a_valider",
        nextAction: "Vérifier l'état réel, négocier à 30 euros, acheter seulement après validation.",
        notes: "Marge estimée avant déplacement et frais. Achat bloqué sans ton feu vert.",
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ],
    messages: [
      {
        id: "audit-premier-contact",
        label: "Approche audit Google",
        engine: "Audit Google",
        body: "Bonjour, j'ai regardé rapidement votre fiche Google. Il y a 3 points simples qui peuvent vous faire gagner plus d'appels et de visites sans publicité. Je peux vous envoyer un mini audit clair en 24h, avec les corrections prioritaires. Le format express est à 99 euros. Vous voulez que je vous montre un exemple ?"
      },
      {
        id: "fiche-avant-apres",
        label: "Avant/après fiche produit",
        engine: "Fiches produits",
        body: "Bonjour, je suis tombé sur une de vos fiches produit. Le produit a du potentiel, mais la présentation ne met pas assez en avant les bénéfices, les objections et les mots-clés d'achat. Je peux vous refaire une fiche test en avant/après. Si ça vous plaît, le pack de 10 fiches est à 149 euros."
      },
      {
        id: "relance-douce",
        label: "Relance douce",
        engine: "Tous",
        body: "Bonjour, je me permets une petite relance. J'ai gardé la proposition de côté : l'idée est de corriger les points qui font perdre des demandes, sans vous ajouter de travail. Si vous voulez, je vous envoie le plan en 3 actions prioritaires."
      },
      {
        id: "paiement",
        label: "Demande paiement",
        engine: "Tous",
        body: "Parfait, je peux lancer la préparation. Pour bloquer le créneau, voici le lien de paiement. Dès réception, je vous livre la première version sous 24h avec une synthèse claire et les actions recommandées."
      },
      {
        id: "livraison",
        label: "Livraison client",
        engine: "Tous",
        body: "Voici la livraison. J'ai mis en priorité ce qui peut produire un effet rapide : clarté de l'offre, éléments de réassurance, mots-clés utiles et appel à l'action. Dites-moi ce que vous souhaitez ajuster et je vous fais une passe de correction."
      }
    ],
    paymentLinks: [
      {
        id: "audit-express",
        label: "Audit Express",
        amount: 49,
        mode: "live",
        url: "https://buy.stripe.com/00w8wQ6IH3YZfcZ45n0gw00"
      },
      {
        id: "audit-action",
        label: "Audit Action",
        amount: 99,
        mode: "live",
        url: "https://buy.stripe.com/bJe7sMeb92UVc0NdFX0gw02"
      },
      {
        id: "fiche-produit-solo",
        label: "Fiche produit solo",
        amount: 79,
        mode: "live",
        url: "https://buy.stripe.com/cNi4gAffd533e8VeK10gw01"
      },
      {
        id: "pack-10-fiches",
        label: "Pack 10 fiches",
        amount: 149,
        mode: "live",
        url: "https://buy.stripe.com/3cI6oI7ML8ff5CpdFX0gw03"
      }
    ],
    leads: [],
    activity: [
      {
        id: "act-001",
        at: nowIso(),
        actor: "Nora",
        message: "Cockpit initialisé avec les trois moteurs et les deux garde-fous."
      }
    ]
  };
}

function evaluateOpportunity(opp) {
  const revenue = Number(opp.potentialRevenue || 0);
  const cost = Number(opp.cost || 0);
  const margin = revenue - cost;
  const marginRate = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  opp.expectedMargin = margin;
  opp.marginRate = marginRate;

  if (margin <= 0) {
    opp.financeVerdict = "Bloqué";
  } else if (margin < 30 || marginRate < 45) {
    opp.financeVerdict = "A vérifier";
  } else {
    opp.financeVerdict = "OK";
  }

  if (opp.riskLevel === "high") {
    opp.riskVerdict = "Bloqué";
  } else if (opp.riskLevel === "medium") {
    opp.riskVerdict = "Revue requise";
  } else {
    opp.riskVerdict = "OK";
  }

  opp.guardianSummary = `Claire: ${opp.financeVerdict} (${margin} euros estimés). Hugo: ${opp.riskVerdict}.`;
  return opp;
}

function prospectTemplates() {
  return [
    {
      company: "Restaurant independant",
      contact: "",
      email: "",
      website: "",
      segment: "Commerce local",
      source: "Recherche locale a completer",
      need: "Fiche Google peu rassurante ou pas assez orientee reservation.",
      offerId: "audit-action",
      offerLabel: "Audit Action",
      amount: 99,
      fitScore: 82
    },
    {
      company: "Boutique artisanale en ligne",
      contact: "",
      email: "",
      website: "",
      segment: "E-commerce",
      source: "Recherche fiche produit a completer",
      need: "Fiches produits trop descriptives, pas assez orientees benefices et objections.",
      offerId: "pack-10-fiches",
      offerLabel: "Pack 10 fiches",
      amount: 149,
      fitScore: 88
    },
    {
      company: "Salon de beaute local",
      contact: "",
      email: "",
      website: "",
      segment: "Service local",
      source: "Recherche locale a completer",
      need: "Offre claire mais page ou fiche Google pas assez convaincante.",
      offerId: "audit-express",
      offerLabel: "Audit Express",
      amount: 49,
      fitScore: 74
    },
    {
      company: "Artisan avec site vitrine",
      contact: "",
      email: "",
      website: "",
      segment: "Artisan",
      source: "Recherche locale a completer",
      need: "Page de service qui manque de preuves, d'appel a l'action et de clarte.",
      offerId: "audit-action",
      offerLabel: "Audit Action",
      amount: 99,
      fitScore: 79
    },
    {
      company: "Createur marketplace",
      contact: "",
      email: "",
      website: "",
      segment: "Vendeur independant",
      source: "Recherche marketplace a completer",
      need: "Annonce ou fiche produit avec potentiel mais presentation faible.",
      offerId: "fiche-produit-solo",
      offerLabel: "Fiche produit solo",
      amount: 79,
      fitScore: 76
    }
  ];
}

function defaultAgentOs(store) {
  store.agentOs ||= {};
  store.agentOs.mode ||= "validation_humaine";
  store.agentOs.objective ||=
    "Produire des prospects, brouillons et recommandations; la direction valide les envois et les liens de paiement.";
  store.agentOs.approvalPolicy ||= {
    prospectingEmail: "validation_direction",
    paymentLink: "validation_direction",
    purchase: "validation_direction",
    maxSpendWithoutApproval: 0
  };
  store.agentOs.compliance ||= {
    scope: "B2B cible uniquement",
    optOutText:
      "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement STOP et je supprimerai votre contact de ma liste.",
    sourceRule: "Ne contacter que des professionnels avec un message lié à leur activité."
  };
  store.agentOs.compliance.sourceRule = "Ne contacter que des professionnels avec un message lié à leur activité.";
  store.agentOs.compliance.optOutText =
    "Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement STOP et je supprimerai votre contact de ma liste.";
  store.agentOs.compliance.copyRule =
    "Les messages doivent être relus par Hugo, avec accents français, ponctuation naturelle, listes autorisées pour de vraies énumérations, aucun tiret au milieu d'une phrase et aucun deux-points hors URL.";
  store.agentOs.managerBrief ||= {};
  store.agentOs.managerBrief.owner = "Nora";
  store.agentOs.managerBrief.pipeline =
    "1. Trouver des prospects B2B publics. 2. Garder uniquement ceux avec e-mail public exploitable. 3. Récupérer site, téléphone et contexte utile. 4. Qualifier besoin et offre adaptée. 5. Rédiger un mail humain avec preuve de lecture et site Levier Client. 6. Laisser la direction valider avant envoi.";
  store.agentOs.managerBrief.conversionRule =
    "Le premier message doit mener à une réponse simple. Le lien Stripe reste prêt dans le cockpit et s'envoie après validation explicite du besoin.";
  store.agentOs.managerBrief.guardrails =
    "Pas de scraping intrusif, pas de données sensibles, pas de promesse excessive, opt-out STOP obligatoire, envoi seulement après validation humaine.";
  store.agentOs.cycles ||= { lastRun: null, targetDraftsPerCycle: 3 };
  ensureAgentRoster(store);
  store.agentOs.integrations = {
    openai: OPENAI_API_KEY ? "configure" : "manquant",
    googlePlaces: GOOGLE_PLACES_API_KEY ? "configure" : "manquant",
    zoho: ZOHO_SMTP_USER && ZOHO_SMTP_PASS ? "configure" : "manquant",
    sendMode: SEND_MODE
  };
  store.agentOs.prospecting ||= {
    defaultCity: PROSPECTION_CITY,
    dailyLimit: PROSPECTION_DAILY_LIMIT,
    requireEmail: PROSPECTION_REQUIRE_EMAIL,
    lastSearch: null
  };
  store.prospects ||= [];
  store.outbox ||= [];
  return store;
}

function getPaymentLink(store, id) {
  return (store.paymentLinks || []).find((link) => link.id === id) || (store.paymentLinks || [])[0] || null;
}

function offerCatalog(store) {
  return (store.paymentLinks || []).map((offer) => ({
    id: offer.id,
    label: offer.label,
    amount: offer.amount,
    url: offer.url
  }));
}

function draftSubject(prospect) {
  if (prospect.aiSubject) return prospect.aiSubject;
  if (prospect.offerId === "pack-10-fiches") return "Idée simple pour améliorer vos fiches produits";
  if (prospect.offerId === "fiche-produit-solo") return "Une fiche produit peut mieux convertir";
  return "Trois actions rapides pour clarifier votre offre";
}

function prospectEvidenceLines(prospect) {
  const intel = prospect.publicIntel || {};
  const research = prospect.publicResearch || {};
  const signals = [];
  if (prospect.rating && prospect.reviews) signals.push(`votre fiche Google affiche ${prospect.rating}/5 avec ${prospect.reviews} avis`);
  if (intel.positioning) signals.push(`votre site présente ${intel.positioning}`);
  if (intel.visibleOffer) signals.push(`un élément mis en avant est ${intel.visibleOffer}`);
  if (intel.friction) signals.push(`le point à clarifier en priorité semble être ${intel.friction}`);
  if (!intel.positioning && research.description) signals.push(`votre site présente ${research.description}`);
  if (!intel.visibleOffer && research.headings?.length) signals.push(`les accroches visibles parlent de ${research.headings.slice(0, 2).join(" et ")}`);
  if (!signals.length && prospect.need) signals.push(prospect.need);
  return signals.slice(0, 3);
}

function textWithoutUrls(text) {
  return String(text || "").replace(/https?:\/\/\S+/gi, "");
}

function copyQualityIssues(text) {
  const body = String(text || "");
  const withoutUrls = textWithoutUrls(body);
  const issues = [];
  const proseOnly = withoutUrls
    .split(/\r?\n/)
    .filter((line) => !/^\s*[-*•]\s+/.test(line))
    .join("\n");
  if (/\S\s[—–-]\s\S/.test(proseOnly)) issues.push("Tiret utilisé au milieu d'une phrase.");
  if (withoutUrls.includes(":")) issues.push("Deux-points détecté hors URL.");
  const missingAccentWords = [
    "ecris",
    "presence",
    "deja",
    "concretes",
    "ameliore",
    "ameliorer",
    "priorite",
    "pretes",
    "cible",
    "resultat",
    "reglement",
    "securise",
    "presente",
    "details",
    "preferez",
    "repondez",
    "adapte",
    "apres",
    "a appliquer"
  ];
  const lower = withoutUrls.toLowerCase();
  const found = missingAccentWords.filter((word) => lower.includes(word));
  if (found.length) issues.push(`Accents à corriger sur ${found.slice(0, 5).join(", ")}.`);
  return issues;
}

function partnerSuggestionText(prospect) {
  const suggestions = prospect.partnerSuggestions || [];
  const manova = suggestions.find((item) => item.partner === "ManovaSite" && item.url);
  const tempsLibre = suggestions.find((item) => item.partner === "Temps Libre" && item.url);
  if (manova) {
    return `J'ai aussi noté un point côté site internet. Si vous voulez aller plus loin après l'audit, notre partenaire ManovaSite peut travailler la présentation, les textes et le parcours de demande. ${manova.url}`;
  }
  if (tempsLibre) {
    return `Si votre volume de demandes, de mails ou de rendez-vous prend trop de temps, notre partenaire Temps Libre peut aussi mettre en place des agents IA pour alléger le suivi quotidien. ${tempsLibre.url}`;
  }
  return "";
}

function cleanSnippetForEmail(value) {
  let cleaned = decodeHtmlEntities(cleanString(value))
    .replace(/\s+-\s+/g, " ")
    .replace(/^découvrez notre\s+/i, "un ")
    .replace(/^découvrez\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
  const words = cleaned.split(/\s+/);
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(" ").toLowerCase();
    const right = words.slice(half).join(" ").toLowerCase();
    if (left === right) cleaned = words.slice(0, half).join(" ");
  }
  return cleaned;
}

function sentenceFromSignal(value) {
  const cleaned = cleanSnippetForEmail(value);
  if (!cleaned) return "";
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function draftBody(store, prospect) {
  if (prospect.aiBody && copyQualityIssues(prospect.aiBody).length === 0) return prospect.aiBody;
  const compliance = defaultAgentOs(store).agentOs.compliance;
  const offer = getPaymentLink(store, prospect.offerId);
  const amount = offer?.amount || prospect.amount || 0;
  const label = offer?.label || prospect.offerLabel || "Audit";
  const firstLine = "Bonjour,";
  const evidence = prospectEvidenceLines(prospect);
  const evidenceParagraph = evidence.length
    ? `J'ai regardé les informations publiques disponibles sur ${prospect.company}. ${evidence.map(sentenceFromSignal).filter(Boolean).join(" ")}`
    : "J'ai regardé les informations publiques disponibles et il y a probablement quelques points simples à clarifier.";
  const partnerParagraph = partnerSuggestionText(prospect);

  return [
    firstLine,
    "",
    "Je vous écris parce que votre présence en ligne donne déjà de bons signaux, mais il y a probablement moyen de mieux transformer ces visiteurs en demandes concrètes.",
    "",
    evidenceParagraph,
    "",
    `Je vous propose un ${label}. C'est un document court avec un comparatif avant et après, les points qui peuvent freiner la confiance et trois corrections prioritaires prêtes à appliquer sur votre fiche, votre page ou vos textes.`,
    `Le tarif est de ${amount} euros parce qu'on reste sur un format rapide et ciblé, pas une refonte longue. L'objectif n'est pas de promettre un résultat garanti, mais de vous donner une base claire pour rendre votre offre plus rassurante et plus facile à comprendre.`,
    ...(partnerParagraph ? ["", partnerParagraph] : []),
    "",
    "Vous pouvez voir Levier Client ici.",
    PUBLIC_SITE_URL,
    "Les offres sont présentées ici.",
    OFFERS_URL,
    "Si le format vous convient, je vous envoie ensuite le lien de règlement sécurisé Stripe correspondant.",
    "",
    "Si vous préférez valider avant, répondez simplement à ce mail. Je vous confirme en deux lignes le format le plus adapté avant paiement.",
    "",
    "Bien cordialement,",
    "Manuel, Levier Client",
    "",
    compliance.optOutText
  ].join("\n");
}

function evaluateDraft(store, draft) {
  const amount = Number(draft.amount || 0);
  draft.financeVerdict = amount >= 49 ? "OK" : "À vérifier";
  draft.riskVerdict = "OK";
  draft.blockers = [];
  draft.financeDetails = [
    `Offre proposée à ${amount} euros.`,
    amount >= 79
      ? "Marge nette attendue correcte pour une prestation courte, sans achat ni sous-traitance obligatoire."
      : "Montant plus faible, intéressant seulement si le livrable reste très cadré.",
    "Dépense engagée avant validation humaine, zéro euro."
  ];
  draft.riskDetails = [
    "Contrôle Hugo sur le destinataire, la conformité B2B, l'opposition STOP, le site Levier Client et la qualité rédactionnelle."
  ];

  if (!draft.to) {
    draft.riskVerdict = "Revue requise";
    draft.blockers.push("Email prospect a completer avant envoi.");
    draft.riskDetails.push("Aucun email destinataire n'est disponible, l'envoi reste bloqué.");
  }

  if (!/STOP/i.test(draft.body || "")) {
    draft.riskVerdict = "Bloque";
    draft.blockers.push("Mention d'opposition manquante.");
    draft.riskDetails.push("La mention d'opposition STOP est absente.");
  }

  if (!/levier-client\.fr/i.test(draft.body || "")) {
    draft.riskVerdict = "Bloque";
    draft.blockers.push("Site Levier Client manquant dans le message.");
    draft.riskDetails.push("Le site Levier Client doit apparaître dans le message pour rassurer le prospect.");
  }

  const copyIssues = copyQualityIssues(draft.body || "");
  if (copyIssues.length) {
    draft.riskVerdict = "Bloque";
    draft.blockers.push(...copyIssues);
    draft.riskDetails.push(`Qualité rédactionnelle à corriger. ${copyIssues.join(" ")}`);
  }

  draft.guardianSummary = `Claire: ${draft.financeVerdict}. Hugo: ${draft.riskVerdict}.`;
  return draft;
}

function buildDraft(store, prospect) {
  return evaluateDraft(store, {
    id: crypto.randomUUID(),
    prospectId: prospect.id,
    type: "prospection",
    channel: "email",
    status: "a_valider",
    to: prospect.email || "",
    subject: draftSubject(prospect),
    body: draftBody(store, prospect),
    offerId: prospect.offerId,
    offerLabel: prospect.offerLabel,
    amount: prospect.amount,
    createdBy: "Redacteur commercial",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

function buildGuardianReports(store, outbox = store.outbox || [], opportunities = store.opportunities || []) {
  const day = new Date().toISOString().slice(0, 10);
  const drafts = outbox || [];
  const readyDrafts = drafts.filter((draft) => draft.status === "pret_a_envoyer");
  const blockedDrafts = drafts.filter((draft) => draft.riskVerdict === "Bloque" || draft.blockers?.length);
  const pipeline = readyDrafts.reduce((sum, draft) => sum + Number(draft.amount || 0), 0);
  const averageTicket = readyDrafts.length ? Math.round(pipeline / readyDrafts.length) : 0;
  const claireDecisions = drafts.slice(0, 12).map((draft) => ({
    company: (store.prospects || []).find((prospect) => prospect.id === draft.prospectId)?.company || draft.to || "Prospect",
    offer: draft.offerLabel,
    amount: draft.amount,
    verdict: draft.financeVerdict,
    reason: draft.financeDetails?.join(" ") || "Marge vérifiée sur une prestation courte."
  }));
  const hugoDecisions = drafts.slice(0, 12).map((draft) => ({
    company: (store.prospects || []).find((prospect) => prospect.id === draft.prospectId)?.company || draft.to || "Prospect",
    verdict: draft.riskVerdict,
    reason: draft.riskDetails?.join(" ") || "Conformité vérifiée.",
    blockers: draft.blockers || []
  }));
  return {
    date: day,
    updatedAt: nowIso(),
    claire: {
      summary:
        readyDrafts.length > 0
          ? `${readyDrafts.length} brouillon(s) prêts. Pipeline potentiel ${pipeline} euros. Panier moyen ${averageTicket} euros. Aucune dépense engagée.`
          : "Aucun brouillon prêt à envoyer pour le moment.",
      controls: claireDecisions,
      watch:
        "Claire surveille le prix, le temps de livraison, la marge nette probable et le fait qu'aucune dépense ne parte sans validation."
    },
    hugo: {
      summary:
        blockedDrafts.length > 0
          ? `${blockedDrafts.length} point(s) à revoir avant envoi. Les messages sans email, sans STOP, sans site Levier Client ou avec fautes restent bloqués.`
          : "Aucun blocage critique. Les brouillons prêts respectent les garde-fous principaux.",
      controls: hugoDecisions,
      watch:
        "Hugo vérifie le B2B ciblé, le destinataire public, la mention STOP, l'absence de promesse excessive, l'orthographe et le style naturel."
    },
    opportunities: opportunities.slice(0, 10).map((opp) => ({
      title: opp.title,
      status: opp.status,
      finance: opp.financeVerdict,
      risk: opp.riskVerdict,
      summary: opp.guardianSummary || ""
    }))
  };
}

function runAgentOsCycle(store) {
  defaultAgentOs(store);
  const existing = new Set((store.prospects || []).map((item) => `${item.company}|${item.segment}`.toLowerCase()));
  const limit = Number(store.agentOs.cycles.targetDraftsPerCycle || 3);
  const additions = prospectTemplates()
    .filter((item) => !existing.has(`${item.company}|${item.segment}`.toLowerCase()))
    .slice(0, limit);

  const prospects = additions.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
    status: "a_completer",
    notes: "Agent: completer le nom reel, le site et l'email avant validation d'envoi.",
    createdAt: nowIso(),
    updatedAt: nowIso()
  }));
  const drafts = prospects.map((prospect) => buildDraft(store, prospect));

  store.prospects = [...prospects, ...(store.prospects || [])].slice(0, 300);
  store.outbox = [...drafts, ...(store.outbox || [])].slice(0, 300);
  store.metrics = { ...(store.metrics || {}), lastCycle: nowIso() };
  store.agentOs.cycles.lastRun = nowIso();

  if (drafts.length) {
    addActivity(store, "Nora", `${drafts.length} brouillon(s) prepares et envoyes aux garde-fous.`);
  } else {
    addActivity(store, "Nora", "Cycle termine: aucune nouvelle cible modele a ajouter. Importer ou saisir de vrais prospects.");
  }

  return { prospects: prospects.length, drafts: drafts.length };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function offerForQuery(query, place = {}) {
  const haystack = normalizeText(`${query} ${(place.types || []).join(" ")} ${place.name || ""}`);
  if (haystack.includes("restaurant") || haystack.includes("salon") || haystack.includes("commerce") || haystack.includes("bar") || haystack.includes("cafe")) {
    return { id: "audit-action", label: "Audit Action", amount: 99 };
  }
  if (haystack.includes("boutique") || haystack.includes("ecommerce") || haystack.includes("shop")) {
    return { id: "pack-10-fiches", label: "Pack 10 fiches", amount: 149 };
  }
  if (haystack.includes("artisan") || haystack.includes("createur") || haystack.includes("produit")) {
    return { id: "fiche-produit-solo", label: "Fiche produit solo", amount: 79 };
  }
  return { id: "audit-express", label: "Audit Express", amount: 49 };
}

function scorePlace(place) {
  const rating = Number(place.rating || 0);
  const reviews = Number(place.userRatingCount || 0);
  let score = 64;
  if (rating >= 4.2) score += 8;
  if (rating > 0 && rating < 4.1) score += 12;
  if (reviews >= 10 && reviews <= 120) score += 12;
  if (!place.websiteUri) score += 5;
  if (place.websiteUri) score += 8;
  return Math.max(40, Math.min(94, score));
}

function needForPlace(place, query) {
  const rating = Number(place.rating || 0);
  const reviews = Number(place.userRatingCount || 0);
  if (!place.websiteUri) return "Presence locale visible, mais site non renseigne dans Google: opportunite d'audit et de clarification rapide.";
  if (rating > 0 && rating < 4.1) return "Avis clients a mieux exploiter et elements de rassurance a renforcer.";
  if (reviews < 20) return "Visibilite locale encore faible: fiche, offre et appels a l'action a renforcer.";
  if (normalizeText(query).includes("restaurant")) return "Fiche Google et page locale a rendre plus convaincantes pour transformer les recherches en appels ou reservations.";
  return "Offre visible mais probablement optimisable: clarte, rassurance, benefices et appel a l'action.";
}

function mapGooglePlaceToProspect(store, place, query, city) {
  const name = place.displayName?.text || place.name || "Prospect local";
  const offer = offerForQuery(query, { name, types: place.types || [] });
  return {
    id: crypto.randomUUID(),
    placeId: place.id || "",
    company: cleanString(name, "Prospect local"),
    contact: "",
    email: "",
    phone: cleanString(place.nationalPhoneNumber),
    address: cleanString(place.formattedAddress),
    mapsUrl: cleanString(place.googleMapsUri),
    website: cleanString(place.websiteUri),
    types: Array.isArray(place.types) ? place.types : [],
    segment: cleanString(query || "Commerce local"),
    source: `Google Places - ${city}`,
    need: needForPlace(place, query),
    offerId: offer.id,
    offerLabel: offer.label,
    amount: offer.amount,
    fitScore: scorePlace(place),
    rating: Number(place.rating || 0),
    reviews: Number(place.userRatingCount || 0),
    status: "a_completer",
    notes: "Prospect réel trouvé via Google Places. E-mail à compléter avant envoi.",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function todayGoogleProspectCount(store) {
  const day = todayKey();
  return (store.prospects || []).filter((prospect) => String(prospect.createdAt || "").startsWith(day) && String(prospect.source || "").startsWith("Google Places")).length;
}

async function searchGooglePlaces(query, city, limit) {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY manquante.");
  }
  const pageSize = Math.max(1, Math.min(Number(limit || 5), 20));
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri,places.types"
    },
    body: JSON.stringify({
      textQuery: `${query} ${city}`.trim(),
      languageCode: "fr",
      regionCode: "FR",
      pageSize
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 403) {
      throw new Error(
        "Google Places refuse l'appel (403). Verifie que Places API (New) est activee sur le bon projet, que la cle est restreinte a Places API (New), et que la facturation du projet est finalisee."
      );
    }
    throw new Error(`Google Places ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  return payload.places || [];
}

function normalizeWebsiteUrl(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (error) {
    return null;
  }
}

function hostRoot(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function sameSite(url, rootHost) {
  return hostRoot(url.hostname) === rootHost;
}

function decodeEmailText(text) {
  return String(text || "")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/\s*(?:\[|\()\s*(?:at|arobase)\s*(?:\]|\))\s*/gi, "@")
    .replace(/\s+(?:at|arobase)\s+/gi, "@")
    .replace(/\s*(?:\[|\()\s*(?:dot|point)\s*(?:\]|\))\s*/gi, ".")
    .replace(/\s+(?:dot|point)\s+/gi, ".");
}

function cleanEmail(value) {
  return String(value || "")
    .trim()
    .replace(/^mailto:/i, "")
    .split("?")[0]
    .replace(/[<>"'()[\]{};,]+$/g, "")
    .toLowerCase();
}

function extractEmails(text) {
  const prepared = decodeEmailText(text);
  const matches = prepared.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  const blockedPrefixes = new Set(["noreply", "no-reply", "donotreply", "dpo", "rgpd", "privacy", "abuse", "postmaster", "webmaster"]);
  const blockedDomains = new Set(["example.com", "example.fr", "schema.org", "sentry.io", "wixpress.com"]);
  return [...new Set(matches.map(cleanEmail))]
    .filter((email) => {
      const [prefix, domain] = email.split("@");
      if (!prefix || !domain || !domain.includes(".")) return false;
      if (blockedPrefixes.has(prefix)) return false;
      if (blockedDomains.has(domain)) return false;
      if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email)) return false;
      return true;
    });
}

function scoreEmail(email, websiteUrl, sourceUrl) {
  const [prefix, domain] = email.split("@");
  const generic = ["contact", "bonjour", "hello", "info", "accueil", "reservation", "reception", "devis", "commercial", "client", "serviceclient"];
  const weak = ["admin", "support", "office", "direction"];
  let score = 20;
  if (websiteUrl && hostRoot(domain) === hostRoot(websiteUrl.hostname)) score += 45;
  if (generic.some((item) => prefix === item || prefix.startsWith(`${item}.`) || prefix.startsWith(`${item}-`))) score += 35;
  if (weak.includes(prefix)) score += 15;
  if (/gmail\.com|outlook\.|hotmail\.|orange\.fr|wanadoo\.fr|free\.fr|laposte\.net/i.test(domain)) score += 5;
  if (/contact|mentions|legal|nous-contacter/i.test(sourceUrl || "")) score += 10;
  return score;
}

function contactCandidateUrls(baseUrl, html) {
  const root = hostRoot(baseUrl.hostname);
  const urls = [baseUrl.href];
  const commonPaths = ["/contact", "/contacts", "/nous-contacter", "/contactez-nous", "/mentions-legales"];
  for (const pathname of commonPaths) urls.push(new URL(pathname, baseUrl.origin).href);

  const linkPattern = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = linkPattern.exec(html || ""))) {
    const href = match[1];
    if (!/contact|nous-contacter|contactez|mentions|legal|reservation|a-propos/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl.href);
      if (url.protocol.startsWith("http") && sameSite(url, root)) urls.push(url.href);
    } catch (error) {
      // Ignore malformed links.
    }
  }

  return [...new Set(urls)].slice(0, CONTACT_PAGE_LIMIT);
}

async function fetchPublicPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTACT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LevierClientContactBot/1.0 (+https://www.levier-client.fr)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.2"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    const html = await response.text();
    return { url: response.url || url, html: html.slice(0, 350000) };
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&eacute;/gi, "e")
    .replace(/&egrave;/gi, "e")
    .replace(/&agrave;/gi, "a")
    .replace(/&ccedil;/gi, "c")
    .replace(/&ocirc;/gi, "o")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)));
}

function isUsablePublicText(text) {
  const value = cleanString(text);
  if (!value) return false;
  if (value.includes("�")) return false;
  if (/best wordpress theme|lorem ipsum|just another wordpress/i.test(value)) return false;
  return true;
}

function extractTitle(html) {
  const title = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return stripHtml(title || "");
}

function extractMetaDescription(html) {
  const match = String(html || "").match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || String(html || "").match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i);
  return stripHtml(match?.[1] || "");
}

function extractHeadings(html) {
  const headings = [];
  const pattern = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const heading = stripHtml(match[1]);
    if (heading && heading.length <= 140) headings.push(heading);
  }
  return [...new Set(headings)].slice(0, 12);
}

function websiteResearchUrls(baseUrl, html) {
  const root = hostRoot(baseUrl.hostname);
  const urls = [baseUrl.href];
  const commonPaths = ["/", "/contact", "/nous-contacter", "/menu", "/carte", "/boutique", "/shop", "/services", "/prestations", "/a-propos"];
  for (const pathname of commonPaths) urls.push(new URL(pathname, baseUrl.origin).href);
  const linkPattern = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = linkPattern.exec(html || ""))) {
    const href = match[1];
    if (!/contact|menu|carte|boutique|shop|service|prestation|a-propos|reservation|commander|produit|offre/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl.href);
      if (url.protocol.startsWith("http") && sameSite(url, root)) urls.push(url.href);
    } catch (error) {
      // Ignore malformed links.
    }
  }
  return [...new Set(urls)].slice(0, CONTACT_PAGE_LIMIT);
}

async function collectPublicWebsiteContext(prospect) {
  const websiteUrl = normalizeWebsiteUrl(prospect.website);
  if (!websiteUrl) return null;
  const homepage = await fetchPublicPage(websiteUrl.href).catch(() => null);
  const urls = websiteResearchUrls(websiteUrl, homepage?.html || "");
  const pages = [];
  for (const url of urls) {
    const page = url === homepage?.url || url === websiteUrl.href ? homepage : await fetchPublicPage(url).catch(() => null);
    if (!page) continue;
    pages.push({
      url: page.url,
      title: extractTitle(page.html),
      description: extractMetaDescription(page.html),
      headings: extractHeadings(page.html),
      text: stripHtml(page.html).slice(0, 4500)
    });
  }
  if (!pages.length) return null;
  return {
    checkedAt: nowIso(),
    sources: pages.map((page) => page.url),
    title: pages.find((page) => page.title)?.title || "",
    description: pages.find((page) => page.description)?.description || "",
    headings: [...new Set(pages.flatMap((page) => page.headings || []))].slice(0, 14),
    text: pages.map((page) => [`Source: ${page.url}`, page.title, page.description, ...(page.headings || []), page.text].filter(Boolean).join("\n")).join("\n\n").slice(0, 15000)
  };
}

function inferPublicIntelFromContext(prospect, context) {
  const headings = (context?.headings || []).filter(isUsablePublicText).map(cleanSnippetForEmail);
  const rawDescription = cleanString(context?.description);
  const description = isUsablePublicText(rawDescription) ? cleanSnippetForEmail(rawDescription) : "";
  const rawTitle = cleanString(context?.title);
  const title = isUsablePublicText(rawTitle) ? cleanSnippetForEmail(rawTitle) : "";
  const headingText = headings.join(" | ");
  const visibleOffer =
    headings.find((item) => /menu|carte|reservation|privatisation|brunch|boutique|service|prestation|commander/i.test(item))
    || headings.find((item) => !/contact|horaire|acces|mentions/i.test(item))
    || title
    || cleanString(prospect.segment);
  let friction = "clarifier l'offre, les benefices et le prochain clic pour transformer une visite en demande.";
  if (!isUsablePublicText(rawDescription)) {
    friction = "certains textes publics semblent generiques ou techniques, ce qui peut reduire la confiance.";
  } else if (/reservation|reserver|zenchef|contact/i.test(headingText) && prospect.rating >= 4.5) {
    friction = "capital avis tres fort a mieux transformer en reservations ou demandes directes.";
  } else if (!description && headings.length < 3) {
    friction = "peu d'elements explicatifs visibles rapidement sur le site.";
  }
  const proofPoints = [
    prospect.rating && prospect.reviews ? `Google: ${prospect.rating}/5 avec ${prospect.reviews} avis` : "",
    title ? `Titre site: ${title}` : "",
    description ? `Description: ${description}` : "",
    ...headings.slice(0, 3).map((heading) => `Accroche: ${heading}`)
  ].filter(Boolean).slice(0, 5);
  return {
    positioning: description || title || cleanString(prospect.segment),
    visibleOffer,
    friction,
    proofPoints,
    rationale: `${prospect.offerLabel || "Audit"} recommande pour transformer les signaux publics existants en corrections concretes, sans refaire tout le site.`
  };
}

function buildPartnerSuggestions(prospect) {
  const suggestions = [];
  const text = normalizeText(
    [
      prospect.company,
      prospect.segment,
      prospect.need,
      prospect.publicIntel?.positioning,
      prospect.publicIntel?.visibleOffer,
      prospect.publicIntel?.friction,
      ...(prospect.publicResearch?.headings || [])
    ].join(" ")
  );
  const siteSignals = [
    text.includes("wordpress"),
    text.includes("theme"),
    text.includes("site"),
    text.includes("menu"),
    text.includes("carte"),
    text.includes("prix"),
    text.includes("boutique"),
    text.includes("reservation"),
    text.includes("parcours"),
    text.includes("contact")
  ];
  if (siteSignals.filter(Boolean).length >= 2 || /site|page|texte|fiche/i.test(prospect.need || "")) {
    suggestions.push({
      partner: "ManovaSite",
      role: "refonte_site",
      url: MANOVASITE_URL,
      reason:
        "Le site ou la page publique montre des signaux de présentation, de textes, de prix ou de parcours qui pourraient mériter une intervention web."
    });
  }
  const timeSignals = [
    text.includes("reservation"),
    text.includes("rendez"),
    text.includes("contact"),
    text.includes("devis"),
    text.includes("client"),
    text.includes("horaire"),
    Number(prospect.reviews || 0) > 250
  ];
  if (timeSignals.filter(Boolean).length >= 2) {
    suggestions.push({
      partner: "Temps Libre",
      role: "agents_ia",
      url: TEMPS_LIBRE_URL,
      reason:
        "Le prospect semble gérer des demandes, réservations, messages ou rendez-vous récurrents. Temps Libre peut devenir pertinent après le premier échange."
    });
  }
  return suggestions;
}

async function findPublicContactEmail(prospect) {
  const websiteUrl = normalizeWebsiteUrl(prospect.website);
  if (!websiteUrl) return { status: "no_website", checkedUrls: [], candidates: [] };

  const checkedUrls = [];
  const candidates = [];
  const homepage = await fetchPublicPage(websiteUrl.href).catch(() => null);
  const urls = contactCandidateUrls(websiteUrl, homepage?.html || "");

  for (const url of urls) {
    const page = url === homepage?.url || url === websiteUrl.href ? homepage : await fetchPublicPage(url).catch(() => null);
    if (!page) continue;
    checkedUrls.push(page.url);
    for (const email of extractEmails(page.html)) {
      candidates.push({
        email,
        sourceUrl: page.url,
        score: scoreEmail(email, websiteUrl, page.url)
      });
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.email);
    if (!previous || candidate.score > previous.score) unique.set(candidate.email, candidate);
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  return {
    status: ranked.length ? "found" : "not_found",
    email: ranked[0]?.email || "",
    sourceUrl: ranked[0]?.sourceUrl || "",
    checkedUrls,
    candidates: ranked
  };
}

function syncDraftWithProspect(store, prospect) {
  for (const draft of store.outbox || []) {
    if (draft.prospectId !== prospect.id) continue;
    draft.to = prospect.email || "";
    draft.subject = draftSubject(prospect);
    draft.body = draftBody(store, prospect);
    draft.offerId = prospect.offerId;
    draft.offerLabel = prospect.offerLabel;
    draft.amount = prospect.amount;
    draft.updatedAt = nowIso();
    evaluateDraft(store, draft);
  }
}

async function enrichProspectContact(store, prospect) {
  if (prospect.email) return { changed: false, status: "already_has_email", company: prospect.company };
  const lookup = await findPublicContactEmail(prospect);
  prospect.contactLookup = {
    checkedAt: nowIso(),
    status: lookup.status,
    checkedUrls: lookup.checkedUrls,
    candidates: lookup.candidates
  };
  if (lookup.email) {
    prospect.email = lookup.email;
    prospect.emailSource = lookup.sourceUrl;
    prospect.status = "a_completer";
    prospect.notes = `${cleanString(prospect.notes)} Email public trouve sur ${lookup.sourceUrl}.`.trim();
    prospect.updatedAt = nowIso();
    syncDraftWithProspect(store, prospect);
    return { changed: true, status: "found", company: prospect.company, email: prospect.email };
  }
  prospect.notes = `${cleanString(prospect.notes)} Aucun email public trouve automatiquement.`.trim();
  prospect.updatedAt = nowIso();
  return { changed: false, status: lookup.status, company: prospect.company };
}

async function enrichProspectContacts(store, options = {}) {
  defaultAgentOs(store);
  const limit = Math.max(1, Math.min(Number(options.limit || CONTACT_LOOKUP_LIMIT), 20));
  const targets = (store.prospects || [])
    .filter((prospect) => !prospect.email && prospect.website)
    .slice(0, limit);
  const results = [];
  for (const prospect of targets) {
    results.push(await enrichProspectContact(store, prospect));
  }
  const found = results.filter((item) => item.changed).length;
  addActivity(store, "Nora", `Recherche contacts: ${found}/${results.length} email(s) public(s) trouve(s).`);
  return { checked: results.length, found, results };
}

async function deepResearchProspects(store, options = {}) {
  defaultAgentOs(store);
  const limit = Math.max(1, Math.min(Number(options.limit || CONTACT_LOOKUP_LIMIT), 20));
  const targets = (store.prospects || [])
    .filter((prospect) => prospect.website || prospect.placeId)
    .slice(0, limit);
  const results = [];
  for (const prospect of targets) {
    if (!prospect.email) await enrichProspectContact(store, prospect);
    const suggestedOffer = offerForQuery(prospect.segment, { name: prospect.company, types: prospect.types || [] });
    prospect.offerId = suggestedOffer.id;
    prospect.offerLabel = suggestedOffer.label;
    prospect.amount = suggestedOffer.amount;
    await enrichProspectWithOpenAI(store, prospect);
    syncDraftWithProspect(store, prospect);
    results.push({
      company: prospect.company,
      email: prospect.email || "",
      offer: prospect.offerLabel,
      amount: prospect.amount,
      fitScore: prospect.fitScore,
      hasIntel: Boolean(prospect.publicIntel)
    });
  }
  addActivity(store, "Nora", `Recherche approfondie: ${results.length} prospect(s) enrichi(s), offres et messages recalibrés.`);
  return { checked: results.length, results };
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

async function enrichProspectWithOpenAI(store, prospect) {
  if (!OPENAI_API_KEY) return prospect;
  const websiteContext = await collectPublicWebsiteContext(prospect).catch(() => null);
  if (websiteContext) {
    prospect.publicResearch = {
      checkedAt: websiteContext.checkedAt,
      sources: websiteContext.sources,
      title: websiteContext.title,
      description: websiteContext.description,
      headings: websiteContext.headings
    };
    prospect.publicIntel = inferPublicIntelFromContext(prospect, websiteContext);
    prospect.partnerSuggestions = buildPartnerSuggestions(prospect);
  }
  const offer = getPaymentLink(store, prospect.offerId);
  const input = [
    {
      role: "developer",
      content:
        [
          "Tu es Nora, manager commercial de Levier Client. Tu mandates les agents terrain, Claire finance et Hugo risque.",
          "Objectif : transformer une recherche publique B2B en brouillon commercial crédible, humain et actionnable.",
          "Utilise uniquement les informations publiques fournies. N'invente pas de chiffres, de problèmes internes, ni de promesse de résultat.",
          "Le mail doit prouver qu'on a lu le contexte public du prospect sans être intrusif.",
          "Il doit expliquer pourquoi l'offre proposée vaut son prix, inclure le site https://www.levier-client.fr et la page offres https://www.levier-client.fr/#formules.",
          "N'inclus pas de lien Stripe direct dans le premier mail froid. Indique seulement qu'un lien de règlement sécurisé peut être envoyé après validation du format.",
          "Le texte du mail doit être en français correct avec accents. Aucune faute d'orthographe. Les listes à tirets sont autorisées seulement pour une vraie énumération courte. N'utilise pas de tiret au milieu d'une phrase. N'utilise pas de deux-points dans les phrases, sauf dans les URL.",
          "Le ton: direct, professionnel, rassurant, pas spam, pas agressif. 130 a 210 mots.",
          "Inclure obligatoirement une phrase d'opposition avec STOP.",
          "Reponds uniquement en JSON compact avec les cles: {\"fitScore\":number,\"offerId\":\"...\",\"need\":\"...\",\"publicIntel\":{\"positioning\":\"...\",\"visibleOffer\":\"...\",\"friction\":\"...\",\"proofPoints\":[\"...\"],\"rationale\":\"...\"},\"subject\":\"...\",\"body\":\"...\"}."
        ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        company: prospect.company,
        segment: prospect.segment,
        address: prospect.address,
        website: prospect.website,
        rating: prospect.rating,
        reviews: prospect.reviews,
        currentOffer: {
          id: prospect.offerId,
          label: prospect.offerLabel,
          amount: prospect.amount,
          paymentUrl: offer?.url || ""
        },
        availableOffers: offerCatalog(store),
        contactEmail: prospect.email || "",
        emailSource: prospect.emailSource || "",
        levierClient: {
          site: PUBLIC_SITE_URL,
          offers: OFFERS_URL,
          contact: CONTACT_URL
        },
        publicWebsiteContext: websiteContext
          ? {
              sources: websiteContext.sources,
              title: websiteContext.title,
              description: websiteContext.description,
              headings: websiteContext.headings,
              text: websiteContext.text
            }
          : null
      })
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input,
        max_output_tokens: 450
      })
    });
    if (!response.ok) return prospect;
    const payload = await response.json();
    const text =
      payload.output_text ||
      (payload.output || [])
        .flatMap((item) => item.content || [])
        .map((item) => item.text || "")
        .join("");
    const data = parseJsonObject(text);
    if (!data) return prospect;
    const selectedOffer = data.offerId ? getPaymentLink(store, cleanString(data.offerId)) : null;
    if (selectedOffer) {
      prospect.offerId = selectedOffer.id;
      prospect.offerLabel = selectedOffer.label;
      prospect.amount = selectedOffer.amount;
    }
    prospect.fitScore = Math.max(40, Math.min(95, Number(data.fitScore || prospect.fitScore)));
    prospect.need = cleanString(data.need, prospect.need);
    if (data.publicIntel && typeof data.publicIntel === "object") {
      prospect.publicIntel = {
        positioning: cleanString(data.publicIntel.positioning),
        visibleOffer: cleanString(data.publicIntel.visibleOffer),
        friction: cleanString(data.publicIntel.friction),
        proofPoints: Array.isArray(data.publicIntel.proofPoints)
          ? data.publicIntel.proofPoints.map((item) => cleanString(item)).filter(Boolean).slice(0, 5)
          : [],
        rationale: cleanString(data.publicIntel.rationale)
      };
    }
    prospect.aiSubject = cleanString(data.subject);
    prospect.aiBody = cleanString(data.body, "");
    prospect.notes = `${prospect.notes} Qualification OpenAI appliquee.`;
  } catch (error) {
    prospect.notes = `${prospect.notes} Qualification OpenAI indisponible: ${error.message}`;
  }
  return prospect;
}

async function runGoogleProspection(store, options = {}) {
  defaultAgentOs(store);
  const query = cleanString(options.query, "restaurant independant");
  const city = cleanString(options.city, PROSPECTION_CITY);
  const requestedLimit = Math.max(1, Math.min(Number(options.limit || 5), 20));
  const usedToday = todayGoogleProspectCount(store);
  const availableToday = Math.max(0, PROSPECTION_DAILY_LIMIT - usedToday);
  const limit = Math.min(requestedLimit, availableToday);
  if (limit <= 0) {
    throw new Error(`Limite quotidienne atteinte (${PROSPECTION_DAILY_LIMIT} prospects Google Places).`);
  }

  const candidateLimit = PROSPECTION_REQUIRE_EMAIL ? Math.min(20, Math.max(limit * 4, limit)) : limit;
  const places = await searchGooglePlaces(query, city, candidateLimit);
  const existingPlaceIds = new Set((store.prospects || []).map((prospect) => prospect.placeId).filter(Boolean));
  const newPlaces = places.filter((place) => place.id && !existingPlaceIds.has(place.id));
  const prospects = [];
  const skipped = [];
  for (const place of newPlaces) {
    const prospect = mapGooglePlaceToProspect(store, place, query, city);
    await enrichProspectContact(store, prospect);
    if (PROSPECTION_REQUIRE_EMAIL && !prospect.email) {
      skipped.push({ company: prospect.company, reason: "email_public_introuvable" });
      continue;
    }
    prospects.push(await enrichProspectWithOpenAI(store, prospect));
    if (prospects.length >= limit) break;
  }
  const drafts = prospects.map((prospect) => buildDraft(store, prospect));

  store.prospects = [...prospects, ...(store.prospects || [])].slice(0, 300);
  store.outbox = [...drafts, ...(store.outbox || [])].slice(0, 300);
  store.agentOs.prospecting.lastSearch = {
    at: nowIso(),
    query,
    city,
    requested: requestedLimit,
    imported: prospects.length,
    skippedNoEmail: skipped.length
  };
  store.metrics = { ...(store.metrics || {}), lastCycle: nowIso() };
  addActivity(
    store,
    "Nora",
    `Google Places: ${prospects.length} prospect(s) avec email importe(s) pour "${query}" a ${city}. ${skipped.length} cible(s) ignoree(s) sans email public.`
  );
  return { imported: prospects.length, found: places.length, skippedNoEmail: skipped.length, query, city };
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket, command, expected = /^[23]/) {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!expected.test(response)) throw new Error(`SMTP ${command}: ${response.trim()}`);
  return response;
}

function encodeHeader(value) {
  return /[^\x00-\x7F]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=` : value;
}

function dotStuff(value) {
  return String(value || "").replace(/^\./gm, "..").replace(/\r?\n/g, "\r\n");
}

async function sendZohoMail({ to, subject, body }) {
  if (!ZOHO_SMTP_USER || !ZOHO_SMTP_PASS) throw new Error("Zoho SMTP non configure.");
  if (!to) throw new Error("Destinataire manquant.");

  let socket = net.createConnection({ host: ZOHO_SMTP_HOST, port: ZOHO_SMTP_PORT });
  await smtpRead(socket);
  await smtpCommand(socket, `EHLO ${PUBLIC_HOST}`);
  if (ZOHO_SMTP_PORT === 587) {
    await smtpCommand(socket, "STARTTLS");
    socket = tls.connect({ socket, servername: ZOHO_SMTP_HOST });
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    await smtpCommand(socket, `EHLO ${PUBLIC_HOST}`);
  }
  await smtpCommand(socket, "AUTH LOGIN", /^334/);
  await smtpCommand(socket, Buffer.from(ZOHO_SMTP_USER).toString("base64"), /^334/);
  await smtpCommand(socket, Buffer.from(ZOHO_SMTP_PASS).toString("base64"));
  await smtpCommand(socket, `MAIL FROM:<${MAIL_FROM}>`);
  await smtpCommand(socket, `RCPT TO:<${to}>`);
  await smtpCommand(socket, "DATA", /^354/);
  const message = [
    `From: ${encodeHeader("Levier Client")} <${MAIL_FROM}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(body),
    "."
  ].join("\r\n");
  await smtpCommand(socket, message);
  await smtpCommand(socket, "QUIT", /^[23]/).catch(() => null);
  socket.end();
}

async function ensureStore() {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const store = JSON.parse(raw);
    defaultAgentOs(store);
    store.opportunities = (store.opportunities || []).map(evaluateOpportunity);
    store.outbox = (store.outbox || []).map((draft) => evaluateDraft(store, draft));
    return store;
  } catch (error) {
    const store = defaultStore();
    defaultAgentOs(store);
    store.opportunities = store.opportunities.map(evaluateOpportunity);
    store.outbox = (store.outbox || []).map((draft) => evaluateDraft(store, draft));
    await writeStore(store);
    return store;
  }
}

async function readStore() {
  return ensureStore();
}

async function writeStore(store) {
  const next = {
    ...store,
    opportunities: (store.opportunities || []).map(evaluateOpportunity)
  };
  defaultAgentOs(next);
  next.outbox = (next.outbox || []).map((draft) => evaluateDraft(next, draft));
  next.agentOs.guardianReports = buildGuardianReports(next, next.outbox, next.opportunities || []);
  await fs.writeFile(STORE_FILE, JSON.stringify(next, null, 2), "utf8");
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function isHttps(req) {
  return req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
}

function cookieOptions(req, maxAge = 86400) {
  const secure = isHttps(req) || IS_PRODUCTION ? "; Secure" : "";
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return {
    algorithm: "pbkdf2-sha256",
    iterations,
    salt,
    hash
  };
}

function verifyPasswordHash(password, passwordHash) {
  if (!passwordHash?.salt || !passwordHash?.hash || passwordHash.algorithm !== "pbkdf2-sha256") {
    return false;
  }
  const iterations = Number(passwordHash.iterations || 210000);
  const candidate = crypto.pbkdf2Sync(password, passwordHash.salt, iterations, 32, "sha256").toString("hex");
  return safeEqual(candidate, passwordHash.hash);
}

function verifyAdminPassword(password, store) {
  const savedHash = store?.security?.passwordHash;
  if (savedHash) return verifyPasswordHash(password, savedHash);
  return safeEqual(password, ADMIN_PASSWORD);
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function isRateLimited(req) {
  const ip = getClientIp(req);
  const windowMs = 10 * 60 * 1000;
  const maxAttempts = 8;
  const now = Date.now();
  const item = loginAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (item.resetAt < now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + windowMs });
    return false;
  }
  return item.count >= maxAttempts;
}

function recordLoginFailure(req) {
  const ip = getClientIp(req);
  const windowMs = 10 * 60 * 1000;
  const now = Date.now();
  const item = loginAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  item.count += 1;
  loginAttempts.set(ip, item);
}

function clearLoginFailures(req) {
  loginAttempts.delete(getClientIp(req));
}

function isAuthed(req) {
  const { sid } = parseCookies(req);
  if (!sid || !sessions.has(sid)) return false;
  const session = sessions.get(sid);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sid);
    return false;
  }
  return true;
}

function securityHeaders(req) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'"
  };
  if (isHttps(req) || IS_PRODUCTION) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

function send(res, status, body, headers = {}) {
  const strictTransport = IS_PRODUCTION ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {};
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...strictTransport,
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function cleanString(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 2000);
}

function addActivity(store, actor, message) {
  store.activity = [
    {
      id: crypto.randomUUID(),
      at: nowIso(),
      actor,
      message
    },
    ...(store.activity || [])
  ].slice(0, 80);
}

function summarize(store) {
  defaultAgentOs(store);
  const opportunities = (store.opportunities || []).map(evaluateOpportunity);
  const outbox = (store.outbox || []).map((draft) => evaluateDraft(store, draft));
  const { security = {}, ...safeStore } = store;
  const byStatus = opportunities.reduce((acc, opp) => {
    acc[opp.status] = (acc[opp.status] || 0) + 1;
    return acc;
  }, {});
  const draftsByStatus = outbox.reduce((acc, draft) => {
    acc[draft.status] = (acc[draft.status] || 0) + 1;
    return acc;
  }, {});
  const potentialPipeline = opportunities
    .filter((opp) => !["refuse", "gagne", "perdu"].includes(opp.status))
    .reduce((sum, opp) => sum + Number(opp.potentialRevenue || 0), 0);
  const cashCommitted = opportunities
    .filter((opp) => opp.status === "achat_valide")
    .reduce((sum, opp) => sum + Number(opp.cost || 0), 0);
  const revenueBooked = opportunities
    .filter((opp) => opp.status === "gagne")
    .reduce((sum, opp) => sum + Number(opp.potentialRevenue || 0), 0);

  return {
    ...safeStore,
    agentOs: {
      ...(safeStore.agentOs || {}),
      guardianReports: buildGuardianReports(store, outbox, opportunities)
    },
    security: {
      passwordChangedAt: security.passwordChangedAt || null
    },
    opportunities,
    outbox,
    metrics: {
      ...(store.metrics || {}),
      potentialPipeline,
      cashCommitted,
      revenueBooked,
      pendingDecisions: byStatus.a_valider || 0,
      pendingDrafts: draftsByStatus.a_valider || 0,
      readyDrafts: draftsByStatus.pret_a_envoyer || 0,
      readyToSend: byStatus.pret_a_envoyer || 0,
      activeLeads: opportunities.filter((opp) => !["refuse", "gagne", "perdu"].includes(opp.status)).length
    }
  };
}

async function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const body = await fs.readFile(filePath);
    send(res, 200, body, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  } catch (error) {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/login" && req.method === "POST") {
    if (isRateLimited(req)) {
      return sendJson(res, 429, { ok: false, error: "Trop de tentatives. Reessaie dans quelques minutes." }, securityHeaders(req));
    }
    const body = await parseBody(req);
    const store = await readStore();
    if (!verifyAdminPassword(cleanString(body.password), store)) {
      recordLoginFailure(req);
      return sendJson(res, 401, { ok: false, error: "Mot de passe incorrect." }, securityHeaders(req));
    }
    clearLoginFailures(req);
    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, { createdAt: Date.now() });
    return sendJson(
      res,
      200,
      { ok: true },
      {
        ...securityHeaders(req),
        "Set-Cookie": `sid=${sid}; ${cookieOptions(req)}`
      }
    );
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const { sid } = parseCookies(req);
    if (sid) sessions.delete(sid);
    return sendJson(res, 200, { ok: true }, { ...securityHeaders(req), "Set-Cookie": `sid=; ${cookieOptions(req, 0)}` });
  }

  if (pathname === "/api/leads" && req.method === "POST") {
    const body = await parseBody(req);
    const store = await readStore();
    const lead = {
      id: crypto.randomUUID(),
      at: nowIso(),
      name: cleanString(body.name),
      contact: cleanString(body.contact),
      offer: cleanString(body.offer),
      message: cleanString(body.message)
    };
    store.leads = [lead, ...(store.leads || [])].slice(0, 200);
    addActivity(store, "Site public", `Nouveau lead: ${lead.offer || "demande entrante"}.`);
    await writeStore(store);
    return sendJson(res, 200, { ok: true }, securityHeaders(req));
  }

  if (!isAuthed(req)) {
    return sendJson(res, 401, { ok: false, error: "Non connecté." }, securityHeaders(req));
  }

  if (pathname === "/api/state" && req.method === "GET") {
    const store = await readStore();
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  if (pathname === "/api/run-cycle" && req.method === "POST") {
    const store = await readStore();
    store.metrics = { ...(store.metrics || {}), lastCycle: nowIso() };
    addActivity(store, "Nora", "Cycle lancé: les moteurs priorisent Audit Google, Fiches Produits et Arbitrage.");
    await writeStore(store);
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  if (pathname === "/api/agent-os/run" && req.method === "POST") {
    const store = await readStore();
    runAgentOsCycle(store);
    await writeStore(store);
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  if (pathname === "/api/agent-os/google-prospect" && req.method === "POST") {
    const body = await parseBody(req);
    try {
      const store = await readStore();
      await runGoogleProspection(store, {
        query: cleanString(body.query, "restaurant independant"),
        city: cleanString(body.city, PROSPECTION_CITY),
        limit: Number(body.limit || 5)
      });
      await writeStore(store);
      return sendJson(res, 200, summarize(store), securityHeaders(req));
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message }, securityHeaders(req));
    }
  }

  if (pathname === "/api/agent-os/enrich-contacts" && req.method === "POST") {
    const body = await parseBody(req);
    try {
      const store = await readStore();
      await enrichProspectContacts(store, { limit: Number(body.limit || CONTACT_LOOKUP_LIMIT) });
      await writeStore(store);
      return sendJson(res, 200, summarize(store), securityHeaders(req));
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message }, securityHeaders(req));
    }
  }

  if (pathname === "/api/agent-os/deep-research" && req.method === "POST") {
    const body = await parseBody(req);
    try {
      const store = await readStore();
      await deepResearchProspects(store, { limit: Number(body.limit || CONTACT_LOOKUP_LIMIT) });
      await writeStore(store);
      return sendJson(res, 200, summarize(store), securityHeaders(req));
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message }, securityHeaders(req));
    }
  }

  if (pathname === "/api/prospects" && req.method === "POST") {
    const body = await parseBody(req);
    const store = await readStore();
    defaultAgentOs(store);
    const offer = getPaymentLink(store, cleanString(body.offerId, "audit-express"));
    const prospect = {
      id: crypto.randomUUID(),
      company: cleanString(body.company, "Prospect"),
      contact: cleanString(body.contact),
      email: cleanString(body.email),
      website: cleanString(body.website),
      segment: cleanString(body.segment, "B2B"),
      source: cleanString(body.source, "Saisie cockpit"),
      need: cleanString(body.need, "Besoin a qualifier."),
      offerId: offer?.id || "audit-express",
      offerLabel: offer?.label || "Audit Express",
      amount: offer?.amount || 49,
      fitScore: Number(body.fitScore || 70),
      status: "a_completer",
      notes: cleanString(body.notes),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const draft = buildDraft(store, prospect);
    store.prospects = [prospect, ...(store.prospects || [])].slice(0, 300);
    store.outbox = [draft, ...(store.outbox || [])].slice(0, 300);
    addActivity(store, "Nora", `Prospect ajoute et brouillon prepare: ${prospect.company}.`);
    await writeStore(store);
    return sendJson(res, 201, summarize(store), securityHeaders(req));
  }

  const prospectMatch = pathname.match(/^\/api\/prospects\/([^/]+)$/);
  if (prospectMatch && req.method === "PATCH") {
    const id = decodeURIComponent(prospectMatch[1]);
    const body = await parseBody(req);
    const store = await readStore();
    const prospect = (store.prospects || []).find((item) => item.id === id);
    if (!prospect) return sendJson(res, 404, { ok: false, error: "Prospect introuvable." }, securityHeaders(req));

    const fields = ["company", "contact", "email", "website", "segment", "source", "need", "status", "notes", "fitScore"];
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        prospect[field] = field === "fitScore" ? Number(body[field] || 0) : cleanString(body[field]);
      }
    }
    prospect.updatedAt = nowIso();

    for (const draft of store.outbox || []) {
      if (draft.prospectId === prospect.id) {
        draft.to = prospect.email || "";
        draft.body = draftBody(store, prospect);
        draft.updatedAt = nowIso();
        evaluateDraft(store, draft);
      }
    }

    addActivity(store, "Nora", `Prospect mis a jour: ${prospect.company}.`);
    await writeStore(store);
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  const outboxMatch = pathname.match(/^\/api\/outbox\/([^/]+)$/);
  if (outboxMatch && req.method === "PATCH") {
    const id = decodeURIComponent(outboxMatch[1]);
    const body = await parseBody(req);
    const store = await readStore();
    const draft = (store.outbox || []).find((item) => item.id === id);
    if (!draft) return sendJson(res, 404, { ok: false, error: "Brouillon introuvable." }, securityHeaders(req));

    const fields = ["status", "to", "subject", "body"];
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) draft[field] = cleanString(body[field], draft[field]);
    }
    draft.updatedAt = nowIso();
    evaluateDraft(store, draft);
    addActivity(store, body.status === "envoye" ? "Direction" : "Nora", `Brouillon ${draft.subject}: statut ${draft.status}.`);
    await writeStore(store);
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  const outboxSendMatch = pathname.match(/^\/api\/outbox\/([^/]+)\/send$/);
  if (outboxSendMatch && req.method === "POST") {
    const id = decodeURIComponent(outboxSendMatch[1]);
    const store = await readStore();
    const draft = (store.outbox || []).find((item) => item.id === id);
    if (!draft) return sendJson(res, 404, { ok: false, error: "Brouillon introuvable." }, securityHeaders(req));
    evaluateDraft(store, draft);
    if (draft.status !== "pret_a_envoyer") {
      return sendJson(res, 400, { ok: false, error: "Le brouillon doit etre valide avant envoi." }, securityHeaders(req));
    }
    if (draft.riskVerdict === "Bloque" || draft.financeVerdict === "Bloque") {
      return sendJson(res, 400, { ok: false, error: "Brouillon bloque par un garde-fou." }, securityHeaders(req));
    }
    if (!draft.to) {
      return sendJson(res, 400, { ok: false, error: "Email destinataire manquant." }, securityHeaders(req));
    }
    try {
      await sendZohoMail({ to: draft.to, subject: draft.subject, body: draft.body });
      draft.status = "envoye";
      draft.sentAt = nowIso();
      draft.updatedAt = nowIso();
      addActivity(store, "Direction", `Email envoye via Zoho: ${draft.subject}.`);
      await writeStore(store);
      return sendJson(res, 200, summarize(store), securityHeaders(req));
    } catch (error) {
      addActivity(store, "Zoho", `Envoi impossible: ${error.message}`);
      await writeStore(store);
      return sendJson(res, 400, { ok: false, error: error.message }, securityHeaders(req));
    }
  }

  if (pathname === "/api/security/password" && req.method === "POST") {
    const body = await parseBody(req);
    const store = await readStore();
    const currentPassword = cleanString(body.currentPassword);
    const newPassword = cleanString(body.newPassword);

    if (!verifyAdminPassword(currentPassword, store)) {
      return sendJson(res, 400, { ok: false, error: "Ancien mot de passe incorrect." }, securityHeaders(req));
    }

    if (newPassword.length < 12) {
      return sendJson(res, 400, { ok: false, error: "Choisis au moins 12 caracteres." }, securityHeaders(req));
    }

    if (safeEqual(currentPassword, newPassword)) {
      return sendJson(res, 400, { ok: false, error: "Le nouveau mot de passe doit etre different." }, securityHeaders(req));
    }

    store.security = {
      ...(store.security || {}),
      passwordHash: createPasswordHash(newPassword),
      passwordChangedAt: nowIso()
    };
    addActivity(store, "Direction", "Mot de passe du cockpit modifie. Les autres sessions ont ete coupees.");
    await writeStore(store);

    const { sid } = parseCookies(req);
    const currentSession = sid ? sessions.get(sid) : null;
    sessions.clear();
    if (sid && currentSession) sessions.set(sid, { createdAt: Date.now() });

    return sendJson(res, 200, { ok: true, message: "Mot de passe modifie." }, securityHeaders(req));
  }

  if (pathname === "/api/opportunities" && req.method === "POST") {
    const body = await parseBody(req);
    const store = await readStore();
    const opp = evaluateOpportunity({
      id: crypto.randomUUID(),
      type: cleanString(body.type, "audit"),
      title: cleanString(body.title, "Nouvelle opportunité"),
      target: cleanString(body.target),
      source: cleanString(body.source, "Saisie cockpit"),
      potentialRevenue: Number(body.potentialRevenue || 0),
      cost: Number(body.cost || 0),
      riskLevel: cleanString(body.riskLevel, "low"),
      priority: cleanString(body.priority, "medium"),
      status: "a_valider",
      nextAction: cleanString(body.nextAction),
      notes: cleanString(body.notes),
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    store.opportunities = [opp, ...(store.opportunities || [])];
    addActivity(store, "Nora", `Nouvelle opportunité ajoutée: ${opp.title}.`);
    await writeStore(store);
    return sendJson(res, 201, summarize(store), securityHeaders(req));
  }

  const oppMatch = pathname.match(/^\/api\/opportunities\/([^/]+)$/);
  if (oppMatch && req.method === "PATCH") {
    const id = decodeURIComponent(oppMatch[1]);
    const body = await parseBody(req);
    const store = await readStore();
    const opp = (store.opportunities || []).find((item) => item.id === id);
    if (!opp) return sendJson(res, 404, { ok: false, error: "Opportunité introuvable." }, securityHeaders(req));

    const fields = ["status", "priority", "riskLevel", "nextAction", "notes", "potentialRevenue", "cost", "title", "target"];
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        opp[field] = ["potentialRevenue", "cost"].includes(field) ? Number(body[field] || 0) : cleanString(body[field]);
      }
    }
    opp.updatedAt = nowIso();
    evaluateOpportunity(opp);
    addActivity(store, "Direction", `${opp.title}: statut passé à ${opp.status}.`);
    await writeStore(store);
    return sendJson(res, 200, summarize(store), securityHeaders(req));
  }

  return sendJson(res, 404, { ok: false, error: "API introuvable." }, securityHeaders(req));
}

function getHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .split(":")[0]
    .toLowerCase();
}

function absoluteUrl(req, host, pathname = "/") {
  const protocol = isHttps(req) || IS_PRODUCTION ? "https" : "http";
  return `${protocol}://${host}${pathname}`;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const host = getHost(req);

  if (IS_PRODUCTION && host === PUBLIC_HOST && ["/pilotage", "/connexion"].includes(pathname)) {
    return send(res, 302, "", { ...securityHeaders(req), Location: absoluteUrl(req, PILOT_HOST, pathname) });
  }

  if (IS_PRODUCTION && host === PILOT_HOST && pathname === "/") {
    return send(res, 302, "", { ...securityHeaders(req), Location: "/pilotage" });
  }

  if (pathname.startsWith("/api/")) {
    return handleApi(req, res, pathname);
  }

  if (pathname === "/pilotage") {
    if (!isAuthed(req)) {
      return send(res, 302, "", { ...securityHeaders(req), Location: "/connexion" });
    }
    return serveFile(res, path.join(PUBLIC_DIR, "cockpit.html"));
  }

  if (pathname === "/connexion") {
    return serveFile(res, path.join(PUBLIC_DIR, "login.html"));
  }

  if (pathname === "/") {
    return serveFile(res, path.join(PUBLIC_DIR, "index.html"));
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
  }
  return serveFile(res, safePath);
}

if (require.main === module) {
  ensureStore().then((store) => {
    if (IS_PRODUCTION && ADMIN_PASSWORD === "cash-2026" && !store.security?.passwordHash) {
      throw new Error("CASH_ADMIN_PASSWORD doit etre defini avec un mot de passe fort en production.");
    }

    http.createServer(handleRequest).listen(PORT, () => {
      console.log(`Levier Client V0 pret: http://localhost:${PORT}`);
      console.log(`Cockpit prive: http://localhost:${PORT}/pilotage`);
    });
  });
}

module.exports = {
  defaultStore,
  defaultAgentOs,
  evaluateDraft,
  runAgentOsCycle,
  runGoogleProspection,
  enrichProspectContacts,
  deepResearchProspects,
  summarize
};

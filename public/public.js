const leadForm = document.querySelector("#leadForm");
const leadStatus = document.querySelector("#leadStatus");
const chatToggle = document.querySelector("#chatToggle");
const chatClose = document.querySelector("#chatClose");
const chatbot = document.querySelector("#chatbot");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatlog = document.querySelector("#chatlog");

function mailtoFallback(data) {
  const subject = encodeURIComponent(`Demande Levier Client - ${data.offer || "contact"}`);
  const body = encodeURIComponent(
    [
      "Bonjour,",
      "",
      "Je souhaite envoyer une demande Levier Client.",
      "",
      `Nom : ${data.name || ""}`,
      `Contact : ${data.contact || ""}`,
      `Besoin : ${data.offer || ""}`,
      "",
      `Message : ${data.message || ""}`,
      "",
      "Merci."
    ].join("\n")
  );
  window.location.href = `mailto:bonjour@levier-client.fr?subject=${subject}&body=${body}`;
}

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  leadStatus.textContent = "Envoi en cours...";
  const data = Object.fromEntries(new FormData(leadForm).entries());
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      leadForm.reset();
      leadStatus.textContent = "Demande envoyée. On revient vers vous rapidement.";
      return;
    }
  } catch (error) {
    // Le site statique Cloudflare n'a pas encore l'API cockpit : on bascule vers email.
  }

  leadStatus.textContent = "Ouverture de votre messagerie...";
  mailtoFallback(data);
});

const answers = [
  {
    keys: ["tarif", "prix", "combien", "cout", "coût"],
    text: "Les formats de départ sont simples : Audit Express 49 euros, Audit Action 99 euros, Fiche produit solo 79 euros, Pack 10 fiches 149 euros. Le besoin est validé avant paiement."
  },
  {
    keys: ["delai", "délai", "temps", "livraison", "24h", "48h"],
    text: "Pour une demande simple, une première version peut souvent être préparée sous 24 à 48h après validation du besoin et du paiement."
  },
  {
    keys: ["audit", "google", "business", "fiche google"],
    text: "L'audit Google Business regarde les points qui freinent les demandes : description, photos, avis, réponses, informations pratiques et clarté de l'appel à l'action."
  },
  {
    keys: ["fiche", "produit", "boutique", "ecommerce", "e-commerce"],
    text: "L'optimisation de fiches produits améliore le titre, les bénéfices, les objections, la réassurance, la FAQ courte et la lisibilité de l'offre."
  },
  {
    keys: ["vente", "garantie", "resultat", "résultat", "promesse"],
    text: "Aucune vente n'est garantie. Levier Client améliore la présentation, la confiance et la clarté, mais le résultat dépend aussi du marché, du prix, du trafic et de l'offre."
  },
  {
    keys: ["humain", "whatsapp", "contact", "appeler", "telephone", "téléphone"],
    text: "Pour une question précise, le plus rapide est WhatsApp. Vous pouvez aussi écrire à bonjour@levier-client.fr."
  },
  {
    keys: ["paiement", "payer", "facture", "devis"],
    text: "Le paiement se fait après validation du besoin. Vous recevez un récapitulatif, puis un lien Stripe sécurisé. Pour un devis ou une facture : devis@levier-client.fr ou facturation@levier-client.fr."
  },
  {
    keys: ["stripe", "lien", "carte bancaire", "cb", "sécurisé", "securise"],
    text: "Les liens Stripe sont envoyés après validation de la demande. Cela évite de payer pour une prestation qui ne correspondrait pas exactement au besoin."
  }
];

function addMessage(text, type) {
  if (!chatlog) return;
  const node = document.createElement("p");
  node.className = type;
  node.textContent = text;
  chatlog.appendChild(node);
  chatlog.scrollTop = chatlog.scrollHeight;
}

function answerQuestion(question) {
  const normalized = question.toLowerCase();
  const match = answers.find((item) => item.keys.some((key) => normalized.includes(key)));
  return match
    ? match.text
    : "Je peux répondre aux questions générales sur les tarifs, délais, audits Google, fiches produits et paiement. Pour une demande plus précise, utilisez WhatsApp ou écrivez à bonjour@levier-client.fr.";
}

chatToggle?.addEventListener("click", () => {
  chatbot.hidden = !chatbot.hidden;
  if (!chatbot.hidden) chatInput?.focus();
});

chatClose?.addEventListener("click", () => {
  chatbot.hidden = true;
});

document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.dataset.question;
    addMessage(question, "user");
    addMessage(answerQuestion(question), "bot");
  });
});

document.querySelectorAll("[data-pick-offer]").forEach((button) => {
  button.addEventListener("click", () => {
    const picked = button.dataset.pickOffer;
    const select = leadForm?.querySelector('select[name="offer"]');
    const message = leadForm?.querySelector('textarea[name="message"]');
    if (select) select.value = picked.toLowerCase().includes("fiche") ? "Fiches produits" : "Audit Google";
    if (message) message.value = `Je souhaite recevoir les informations pour la formule : ${picked}.`;
    document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" });
  });
});

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  addMessage(question, "user");
  addMessage(answerQuestion(question), "bot");
  chatInput.value = "";
});

let state = null;
let currentView = "direction";

const viewRoot = document.querySelector("#viewRoot");
const viewTitle = document.querySelector("#viewTitle");
const navButtons = [...document.querySelectorAll("[data-view]")];
const quickJump = document.querySelector("#quickJump");
const runCycleBtn = document.querySelector("#runCycleBtn");
const logoutBtn = document.querySelector("#logoutBtn");

const viewLabels = {
  direction: "Direction",
  agentos: "Agent OS",
  prospection: "Prospection",
  outbox: "Brouillons",
  controle: "Agent contrôle",
  finance: "Claire - Finance",
  risque: "Hugo - Risque",
  agents: "Agents",
  audit: "Audit Google",
  fiches: "Fiches produits",
  arbitrage: "Arbitrage",
  messages: "Messages rapides",
  security: "S\u00e9curit\u00e9"
};

const statusLabels = {
  a_valider: "À valider",
  pret_a_envoyer: "Prêt à envoyer",
  envoye: "Envoyé",
  en_discussion: "En discussion",
  achat_valide: "Achat validé",
  gagne: "Gagné",
  refuse: "Refusé",
  perdu: "Perdu"
};

const draftStatusLabels = {
  a_valider: "À valider",
  pret_a_envoyer: "Prêt à envoyer",
  envoye: "Envoyé",
  refuse: "Refusé"
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    window.location.href = "/connexion";
    return null;
  }
  return response.json();
}

function euros(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateLabel(value) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function engineType(type) {
  return {
    audit: "Audit Google",
    fiche: "Fiches produits",
    arbitrage: "Arbitrage"
  }[type] || type;
}

function riskTone(value) {
  return value === "high" ? "danger" : value === "medium" ? "warning" : "success";
}

function verdictTone(value) {
  if (value === "Bloque" || value === "Bloqué") return "danger";
  if (value === "A verifier" || value === "A vérifier" || value === "Revue requise") return "warning";
  return value === "Bloqué" ? "danger" : value === "A vérifier" || value === "Revue requise" ? "warning" : "success";
}

function integrationLabel(value) {
  if (value === "configure") return "configuré";
  if (value === "manquant") return "manquant";
  return value || "manquant";
}

function setView(nextView) {
  currentView = nextView;
  viewTitle.textContent = viewLabels[nextView] || "Direction";
  quickJump.value = nextView;
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === nextView));
  render();
}

async function loadState() {
  state = await api("/api/state");
  render();
}

function statCard(label, value, hint, tone = "") {
  return `
    <article class="stat-card ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function pillarCard(key, pillar) {
  return `
    <article class="pillar-card ${key}">
      <div class="pillar-head">
        <span class="avatar">${pillar.name.slice(0, 1)}</span>
        <div>
          <h3>${pillar.name}</h3>
          <p>${pillar.role}</p>
        </div>
      </div>
      <p>${pillar.mission}</p>
      <div class="mini-row">
        <span class="tag teal">${pillar.status}</span>
        <span>${pillar.focus}</span>
      </div>
    </article>
  `;
}

function opportunityCard(opp) {
  return `
    <article class="opportunity-card" data-id="${opp.id}">
      <div class="card-top">
        <div>
          <span class="tag blue">${engineType(opp.type)}</span>
          <h3>${opp.title}</h3>
          <p>${opp.target || "Cible à préciser"}</p>
        </div>
        <select class="status-select" data-action="status" data-id="${opp.id}" aria-label="Changer le statut">
          ${Object.entries(statusLabels)
            .map(([value, label]) => `<option value="${value}" ${opp.status === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>
      <div class="numbers-grid">
        <div><span>CA potentiel</span><strong>${euros(opp.potentialRevenue)}</strong></div>
        <div><span>Coût</span><strong>${euros(opp.cost)}</strong></div>
        <div><span>Marge</span><strong>${euros(opp.expectedMargin)}</strong></div>
        <div><span>Priorité</span><strong>${opp.priority}</strong></div>
      </div>
      <div class="verdict-grid">
        <span class="tag ${verdictTone(opp.financeVerdict)}">Claire: ${opp.financeVerdict}</span>
        <span class="tag ${verdictTone(opp.riskVerdict)}">Hugo: ${opp.riskVerdict}</span>
        <span class="tag ${riskTone(opp.riskLevel)}">Risque ${opp.riskLevel}</span>
      </div>
      <p class="next-action">${opp.nextAction || "Action à définir."}</p>
      <p class="muted">${opp.notes || ""}</p>
      <div class="card-actions">
        <button class="button tiny primary" data-action="quick-status" data-status="pret_a_envoyer" data-id="${opp.id}">Valider</button>
        <button class="button tiny secondary" data-action="quick-status" data-status="en_discussion" data-id="${opp.id}">Discussion</button>
        <button class="button tiny ghost-dark" data-action="quick-status" data-status="refuse" data-id="${opp.id}">Refuser</button>
      </div>
    </article>
  `;
}

function prospectCard(prospect) {
  const website = prospect.website ? `<a class="button tiny ghost-dark" href="${escapeHtml(prospect.website)}" target="_blank" rel="noopener">Site</a>` : "";
  const maps = prospect.mapsUrl ? `<a class="button tiny ghost-dark" href="${escapeHtml(prospect.mapsUrl)}" target="_blank" rel="noopener">Maps</a>` : "";
  return `
    <article class="prospect-card" data-id="${prospect.id}">
      <div class="card-top">
        <div>
          <span class="tag blue">${escapeHtml(prospect.segment || "B2B")}</span>
          <h3>${escapeHtml(prospect.company)}</h3>
          <p>${escapeHtml(prospect.need || "Besoin a qualifier.")}</p>
        </div>
        <span class="tag ${prospect.email ? "success" : "warning"}">${prospect.email ? "Contact prêt" : "Email à compléter"}</span>
      </div>
      <div class="numbers-grid">
        <div><span>Score</span><strong>${prospect.fitScore || 0}/100</strong></div>
        <div><span>Offre</span><strong>${escapeHtml(prospect.offerLabel || "-")}</strong></div>
        <div><span>Montant</span><strong>${euros(prospect.amount)}</strong></div>
        <div><span>Avis</span><strong>${prospect.rating ? `${prospect.rating}/5` : "-"} ${prospect.reviews ? `(${prospect.reviews})` : ""}</strong></div>
      </div>
      <p class="muted">${escapeHtml(prospect.address || prospect.source || "")}</p>
      ${prospect.email ? `<p class="muted">${escapeHtml(prospect.email)}${prospect.emailSource ? ` - source: ${escapeHtml(prospect.emailSource)}` : ""}</p>` : ""}
      ${prospect.publicIntel?.rationale ? `<p class="next-action">${escapeHtml(prospect.publicIntel.rationale)}</p>` : ""}
      <p class="muted">${escapeHtml(prospect.phone || prospect.notes || "")}</p>
      <div class="card-actions">
        <button class="button tiny secondary" data-action="edit-prospect" data-id="${prospect.id}">Completer</button>
        ${website}
        ${maps}
      </div>
    </article>
  `;
}

function draftCard(draft) {
  const paymentLink = (state.paymentLinks || []).find((link) => link.id === draft.offerId);
  const mailto = `mailto:${encodeURIComponent(draft.to || "")}?subject=${encodeURIComponent(draft.subject || "")}&body=${encodeURIComponent(draft.body || "")}`;
  const canZoho = state.agentOs?.integrations?.zoho === "configure" && draft.status === "pret_a_envoyer";
  return `
    <article class="draft-card" data-id="${draft.id}">
      <div class="card-top">
        <div>
          <span class="tag teal">${escapeHtml(draft.offerLabel || "Message")}</span>
          <h3>${escapeHtml(draft.subject)}</h3>
          <p>${escapeHtml(draft.to || "Email prospect a completer")}</p>
        </div>
        <select class="status-select" data-action="draft-status" data-id="${draft.id}" aria-label="Changer le statut du brouillon">
          ${Object.entries(draftStatusLabels)
            .map(([value, label]) => `<option value="${value}" ${draft.status === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>
      <div class="verdict-grid">
        <span class="tag ${verdictTone(draft.financeVerdict)}">Claire: ${escapeHtml(draft.financeVerdict)}</span>
        <span class="tag ${verdictTone(draft.riskVerdict)}">Hugo: ${escapeHtml(draft.riskVerdict)}</span>
        <span class="tag blue">${euros(draft.amount)}</span>
      </div>
      ${draft.financeDetails?.length ? `<p class="muted">${escapeHtml(draft.financeDetails.join(" "))}</p>` : ""}
      ${draft.riskDetails?.length ? `<p class="muted">${escapeHtml(draft.riskDetails.join(" "))}</p>` : ""}
      ${draft.blockers?.length ? `<p class="next-action">${escapeHtml(draft.blockers.join(" "))}</p>` : ""}
      <pre class="draft-body">${escapeHtml(draft.body)}</pre>
      <div class="card-actions">
        <button class="button tiny primary" data-action="draft-approve" data-id="${draft.id}">Valider</button>
        <button class="button tiny secondary" data-action="copy-message" data-body="${encodeURIComponent(draft.body)}">Copier mail</button>
        ${draft.to ? `<a class="button tiny ghost-dark" href="${mailto}">Ouvrir mail</a>` : ""}
        ${paymentLink ? `<button class="button tiny secondary" data-action="copy-message" data-body="${encodeURIComponent(paymentLink.url)}">Copier Stripe</button>` : ""}
        ${canZoho ? `<button class="button tiny primary" data-action="send-zoho" data-id="${draft.id}">Envoyer Zoho</button>` : ""}
        <button class="button tiny ghost-dark" data-action="draft-reject" data-id="${draft.id}">Refuser</button>
      </div>
    </article>
  `;
}

function renderDirection() {
  const { metrics, pillars, brand, opportunities, activity } = state;
  const pending = opportunities.filter((opp) => opp.status === "a_valider");
  const pendingDrafts = (state.outbox || []).filter((draft) => draft.status === "a_valider");
  viewRoot.innerHTML = `
    <div class="stats-grid">
      ${statCard("Pipeline potentiel", euros(metrics.potentialPipeline), "Opportunités non clôturées", "teal-line")}
      ${statCard("Décisions", (metrics.pendingDecisions || 0) + pendingDrafts.length, "Opportunites + brouillons", "amber-line")}
      ${statCard("Cash engagé", euros(metrics.cashCommitted), "Achats déjà validés", "red-line")}
      ${statCard("Ventes", euros(metrics.revenueBooked), "CA gagné dans le cockpit", "blue-line")}
    </div>

    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Nom de site</p>
        <h2>${brand.activeName}</h2>
        <p>${brand.tagline}</p>
        <div class="name-cloud">
          ${brand.nameIdeas.map((name) => `<span>${name}</span>`).join("")}
        </div>
      </div>
      <div>
        <p class="eyebrow">A décider</p>
        <h2>${pending.length + pendingDrafts.length} validations</h2>
        <p>Tout achat, toute dépense, tout mail de prospection et tout lien de paiement reste bloqué jusqu'à ton accord.</p>
      </div>
    </section>

    <section class="pillar-grid">
      ${pillarCard("manager", pillars.manager)}
      ${pillarCard("finance", pillars.finance)}
      ${pillarCard("risk", pillars.risk)}
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Priorité du jour</p>
          <h2>Opportunités à valider</h2>
        </div>
      </div>
      <div class="opportunity-list">
        ${pending.map(opportunityCard).join("") || "<p class='muted'>Aucune décision en attente.</p>"}
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Journal</p>
          <h2>Activité récente</h2>
        </div>
      </div>
      <div class="activity-list">
        ${activity.slice(0, 6).map((item) => `<p><strong>${item.actor}</strong> <span>${dateLabel(item.at)}</span><br />${item.message}</p>`).join("")}
      </div>
    </section>
  `;
}

function renderControle() {
  const { pillars, metrics, opportunities } = state;
  const ready = opportunities.filter((opp) => ["a_valider", "pret_a_envoyer", "en_discussion"].includes(opp.status));
  viewRoot.innerHTML = `
    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Chef d'orchestre</p>
        <h2>${pillars.manager.name}</h2>
        <p>${pillars.manager.mission}</p>
      </div>
      <div class="control-list">
        <p><strong>Dernier cycle :</strong> ${dateLabel(metrics.lastCycle)}</p>
        <p><strong>File active :</strong> ${ready.length} opportunités</p>
        <p><strong>Objectif :</strong> transformer vite les validations en messages envoyés.</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">File de décisions</p>
          <h2>Nora prépare l'ordre d'action</h2>
        </div>
      </div>
      <div class="opportunity-list">
        ${ready.map(opportunityCard).join("") || "<p class='muted'>File vide.</p>"}
      </div>
    </section>
  `;
}

function renderAgentOs() {
  const os = state.agentOs || {};
  const pendingDrafts = (state.outbox || []).filter((draft) => draft.status === "a_valider");
  const readyDrafts = (state.outbox || []).filter((draft) => draft.status === "pret_a_envoyer");
  const prospects = state.prospects || [];
  const reports = os.guardianReports || {};
  viewRoot.innerHTML = `
    <div class="stats-grid">
      ${statCard("Prospects", prospects.length, "Cibles dans le système", "teal-line")}
      ${statCard("Brouillons", pendingDrafts.length, "À valider", "amber-line")}
      ${statCard("Prêts", readyDrafts.length, "À envoyer", "blue-line")}
      ${statCard("Mode", "20%", "Direction humaine", "red-line")}
    </div>

    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Système opérationnel</p>
        <h2>${os.mode || "validation_humaine"}</h2>
        <p>${os.objective || ""}</p>
        ${os.managerBrief?.pipeline ? `<p class="next-action">${escapeHtml(os.managerBrief.pipeline)}</p>` : ""}
      </div>
      <div class="control-list">
        <p><strong>Nora :</strong> produit les priorites et distribue le travail.</p>
        <p><strong>Claire :</strong> bloque les marges faibles et les depenses.</p>
        <p><strong>Hugo :</strong> bloque la reputation, la conformite et les promesses trop fortes.</p>
        ${os.managerBrief?.conversionRule ? `<p><strong>Conversion :</strong> ${escapeHtml(os.managerBrief.conversionRule)}</p>` : ""}
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Règles d'autonomie</p>
          <h2>Tout part en validation</h2>
        </div>
        <button class="button secondary" id="agentCycleBtn" type="button">Lancer un cycle agents</button>
      </div>
      <div class="agent-rules">
        <p><strong>Prospection :</strong> brouillon préparé, envoi bloqué jusqu'à validation.</p>
        <p><strong>Paiement :</strong> lien Stripe prêt dans le cockpit, envoyé seulement après réponse ou validation explicite.</p>
        <p><strong>Achat :</strong> zéro dépense sans accord direction.</p>
        <p><strong>Conformité :</strong> B2B ciblé, message utile, opposition simple.</p>
      </div>
    </section>

    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Rapport Claire</p>
        <h2>Finance du jour</h2>
        <p>${escapeHtml(reports.claire?.summary || "Aucun rapport finance pour le moment.")}</p>
        <p class="muted">${escapeHtml(reports.claire?.watch || "")}</p>
      </div>
      <div>
        <p class="eyebrow">Rapport Hugo</p>
        <h2>Risque du jour</h2>
        <p>${escapeHtml(reports.hugo?.summary || "Aucun rapport risque pour le moment.")}</p>
        <p class="muted">${escapeHtml(reports.hugo?.watch || "")}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Intégrations</p>
          <h2>Connexions agents</h2>
        </div>
      </div>
      <div class="agent-rules">
        <p><strong>OpenAI :</strong> ${integrationLabel(os.integrations?.openai)}</p>
        <p><strong>Google Places :</strong> ${integrationLabel(os.integrations?.googlePlaces)}</p>
        <p><strong>Zoho :</strong> ${integrationLabel(os.integrations?.zoho)}</p>
        <p><strong>Envoi :</strong> ${os.integrations?.sendMode || "approval"}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">File chaude</p>
          <h2>Brouillons à valider</h2>
        </div>
      </div>
      <div class="opportunity-list">
        ${pendingDrafts.slice(0, 4).map(draftCard).join("") || "<p class='muted'>Aucun brouillon en attente.</p>"}
      </div>
    </section>
  `;
}

function renderProspection() {
  const prospects = state.prospects || [];
  const defaultCity = state.agentOs?.prospecting?.defaultCity || "Montpellier";
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Google Places</p>
          <h2>Recherche terrain</h2>
        </div>
        <span class="tag ${state.agentOs?.integrations?.googlePlaces === "configure" ? "success" : "warning"}">${state.agentOs?.integrations?.googlePlaces || "manquant"}</span>
      </div>
      <form class="inline-form" id="googleProspectForm">
        <label>Metier / cible
          <input name="query" value="restaurant independant" placeholder="restaurant, salon, artisan..." required />
        </label>
        <label>Ville
          <input name="city" value="${escapeHtml(defaultCity)}" required />
        </label>
        <label>Nombre
          <input name="limit" type="number" min="1" max="20" value="5" />
        </label>
        <button class="button primary" type="submit">Chercher prospects</button>
        <p class="form-status" id="googleProspectStatus" aria-live="polite"></p>
      </form>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Prospection</p>
          <h2>${prospects.length} prospect(s)</h2>
        </div>
        <div class="card-actions">
          <button class="button primary" type="button" data-action="deep-research">Recherche complète</button>
          <button class="button secondary" type="button" data-action="enrich-contact-emails">Chercher emails</button>
          <button class="button secondary" type="button" data-action="show-prospect-form">Ajouter prospect</button>
        </div>
      </div>
      <div class="create-zone" id="createProspectZone"></div>
      <div class="opportunity-list">
        ${prospects.map(prospectCard).join("") || "<p class='muted'>Aucun prospect. Lance un cycle agents.</p>"}
      </div>
    </section>
  `;
}

function renderOutbox() {
  const drafts = state.outbox || [];
  const pending = drafts.filter((draft) => ["a_valider", "pret_a_envoyer"].includes(draft.status));
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Brouillons agents</p>
          <h2>${pending.length} action(s) à traiter</h2>
        </div>
        <button class="button secondary" id="agentCycleBtn" type="button">Lancer un cycle agents</button>
      </div>
      <div class="opportunity-list">
        ${drafts.map(draftCard).join("") || "<p class='muted'>Aucun brouillon. Lance un cycle agents.</p>"}
      </div>
    </section>
  `;
}

function renderGuardian(kind) {
  const pillar = kind === "finance" ? state.pillars.finance : state.pillars.risk;
  const report = kind === "finance" ? state.agentOs?.guardianReports?.claire : state.agentOs?.guardianReports?.hugo;
  const filtered = state.opportunities.filter((opp) => {
    if (kind === "finance") return opp.financeVerdict !== "OK";
    return opp.riskVerdict !== "OK";
  });
  viewRoot.innerHTML = `
    <section class="panel split-panel">
      <div>
        <p class="eyebrow">${pillar.role}</p>
        <h2>${pillar.name}</h2>
        <p>${pillar.mission}</p>
      </div>
      <div>
        <p class="eyebrow">Règle</p>
        <h2>${kind === "finance" ? "Marge avant vitesse" : "Réputation avant volume"}</h2>
        <p>${pillar.focus}</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Rapport du jour</p>
          <h2>${kind === "finance" ? "Claire explique ses arbitrages" : "Hugo explique ses contrôles"}</h2>
        </div>
      </div>
      <p>${escapeHtml(report?.summary || "Aucun rapport pour le moment.")}</p>
      <div class="opportunity-list">
        ${(report?.controls || [])
          .map(
            (item) => `
            <article class="opportunity-card">
              <div class="card-top">
                <div>
                  <span class="tag ${verdictTone(item.verdict)}">${escapeHtml(item.verdict || "")}</span>
                  <h3>${escapeHtml(item.company || item.offer || "Contrôle")}</h3>
                  <p>${escapeHtml(item.reason || "")}</p>
                </div>
              </div>
              ${item.blockers?.length ? `<p class="next-action">${escapeHtml(item.blockers.join(" "))}</p>` : ""}
            </article>`
          )
          .join("") || "<p class='muted'>Aucun contrôle détaillé.</p>"}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Alertes</p>
          <h2>${filtered.length} point(s) à revoir</h2>
        </div>
      </div>
      <div class="opportunity-list">
        ${filtered.map(opportunityCard).join("") || "<p class='muted'>Aucune alerte pour ce garde-fou.</p>"}
      </div>
    </section>
  `;
}

function renderAgents() {
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Agents opérationnels</p>
          <h2>Liste des moteurs sans prénoms</h2>
        </div>
      </div>
      <div class="agent-grid">
        ${state.agents
          .map(
            (agent) => `
            <article class="agent-card">
              <span class="tag blue">${agent.engine}</span>
              <h3>${agent.role}</h3>
              <p>${agent.mission}</p>
              <small>${agent.cadence}</small>
            </article>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderEngine(type) {
  const list = state.opportunities.filter((opp) => opp.type === type);
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">${engineType(type)}</p>
          <h2>${list.length} opportunité(s)</h2>
        </div>
        <button class="button secondary" type="button" data-action="show-create" data-type="${type}">Ajouter</button>
      </div>
      <div class="create-zone" id="createZone"></div>
      <div class="opportunity-list">
        ${list.map(opportunityCard).join("") || "<p class='muted'>Aucune opportunité pour ce moteur.</p>"}
      </div>
    </section>
  `;
}

function renderMessages() {
  viewRoot.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Stripe</p>
          <h2>Liens de paiement</h2>
        </div>
        <span class="tag success">Production</span>
      </div>
      <div class="message-grid">
        ${paymentLinkCards(state.paymentLinks || [])}
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Raccourcis</p>
          <h2>Messages rapides</h2>
        </div>
        <select id="messageFilter" aria-label="Filtrer les messages">
          <option value="Tous">Tous</option>
          <option value="Audit Google">Audit Google</option>
          <option value="Fiches produits">Fiches produits</option>
        </select>
      </div>
      <div class="message-grid" id="messageGrid">
        ${messageCards(state.messages)}
      </div>
    </section>
  `;
}

function paymentLinkCards(paymentLinks) {
  return paymentLinks
    .map(
      (link) => `
      <article class="message-card">
        <span class="tag ${link.mode === "test" ? "warning" : "success"}">${link.mode === "test" ? "Test Stripe" : "Stripe"}</span>
        <h3>${link.label} - ${euros(link.amount)}</h3>
        <p>${link.url}</p>
        <div class="card-actions">
          <button class="button tiny secondary" data-action="copy-message" data-body="${encodeURIComponent(link.url)}">Copier le lien</button>
          <a class="button tiny ghost-dark" href="${link.url}" target="_blank" rel="noopener">Ouvrir</a>
        </div>
      </article>`
    )
    .join("");
}

function renderSecurity() {
  const changedAt = state.security?.passwordChangedAt ? dateLabel(state.security.passwordChangedAt) : "Jamais";
  viewRoot.innerHTML = `
    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Acc\u00e8s priv\u00e9</p>
        <h2>Mot de passe cockpit</h2>
        <p>Tu peux le modifier ici quand tu veux. Le nouveau mot de passe remplace l'ancien pour les prochaines connexions.</p>
        <div class="control-list">
          <p><strong>Derni\u00e8re modification :</strong> ${changedAt}</p>
          <p><strong>S\u00e9curit\u00e9 :</strong> les autres sessions sont coup\u00e9es apr\u00e8s changement.</p>
        </div>
      </div>
      <form class="security-form" id="passwordForm">
        <label>Mot de passe actuel
          <input name="currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label>Nouveau mot de passe
          <input name="newPassword" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <label>Confirmer le nouveau mot de passe
          <input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required />
        </label>
        <button class="button primary" type="submit">Changer le mot de passe</button>
        <p class="form-status" id="passwordStatus" aria-live="polite"></p>
      </form>
    </section>
  `;
}

function messageCards(messages) {
  return messages
    .map(
      (message) => `
      <article class="message-card">
        <span class="tag teal">${message.engine}</span>
        <h3>${message.label}</h3>
        <p>${message.body}</p>
        <button class="button tiny secondary" data-action="copy-message" data-body="${encodeURIComponent(message.body)}">Copier</button>
      </article>`
    )
    .join("");
}

function renderCreateForm(type) {
  const zone = document.querySelector("#createZone");
  if (!zone) return;
  zone.innerHTML = `
    <form class="inline-form" id="createOppForm">
      <input type="hidden" name="type" value="${type}" />
      <label>Titre<input name="title" required placeholder="Ex: Audit fiche Google - boulangerie" /></label>
      <label>Cible<input name="target" placeholder="Client, annonce ou commerce" /></label>
      <label>CA potentiel<input name="potentialRevenue" type="number" min="0" value="99" /></label>
      <label>Coût<input name="cost" type="number" min="0" value="0" /></label>
      <label>Risque
        <select name="riskLevel">
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </label>
      <label>Prochaine action<textarea name="nextAction" rows="3"></textarea></label>
      <button class="button primary" type="submit">Ajouter au cockpit</button>
    </form>
  `;
}

function renderProspectForm(prospect = null) {
  const zone = document.querySelector("#createProspectZone");
  if (!zone) return;
  const isEdit = Boolean(prospect);
  zone.innerHTML = `
    <form class="inline-form" id="${isEdit ? "editProspectForm" : "createProspectForm"}">
      <input type="hidden" name="id" value="${prospect?.id || ""}" />
      <label>Entreprise<input name="company" required value="${prospect?.company || ""}" placeholder="Ex: Restaurant du centre" /></label>
      <label>Email<input name="email" type="email" value="${prospect?.email || ""}" placeholder="contact@..." /></label>
      <label>Segment<input name="segment" value="${prospect?.segment || "Commerce local"}" /></label>
      <label>Site<input name="website" value="${prospect?.website || ""}" placeholder="https://..." /></label>
      <label>Score<input name="fitScore" type="number" min="0" max="100" value="${prospect?.fitScore || 70}" /></label>
      <label>Offre
        <select name="offerId">
          ${(state.paymentLinks || [])
            .map((link) => `<option value="${link.id}" ${prospect?.offerId === link.id ? "selected" : ""}>${link.label} - ${euros(link.amount)}</option>`)
            .join("")}
        </select>
      </label>
      <label>Besoin repéré<textarea name="need" rows="3">${prospect?.need || ""}</textarea></label>
      <label>Notes<textarea name="notes" rows="3">${prospect?.notes || ""}</textarea></label>
      <button class="button primary" type="submit">${isEdit ? "Mettre à jour" : "Ajouter et préparer"}</button>
    </form>
  `;
}

function render() {
  if (!state) {
    viewRoot.innerHTML = "<p class='muted'>Chargement du cockpit...</p>";
    return;
  }

  if (currentView === "direction") renderDirection();
  if (currentView === "agentos") renderAgentOs();
  if (currentView === "prospection") renderProspection();
  if (currentView === "outbox") renderOutbox();
  if (currentView === "controle") renderControle();
  if (currentView === "finance") renderGuardian("finance");
  if (currentView === "risque") renderGuardian("risk");
  if (currentView === "agents") renderAgents();
  if (currentView === "audit") renderEngine("audit");
  if (currentView === "fiches") renderEngine("fiche");
  if (currentView === "arbitrage") renderEngine("arbitrage");
  if (currentView === "messages") renderMessages();
  if (currentView === "security") renderSecurity();
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.view) {
    setView(button.dataset.view);
  }

  if (button.dataset.action === "quick-status") {
    const payload = await api(`/api/opportunities/${button.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: button.dataset.status })
    });
    state = payload;
    render();
  }

  if (button.dataset.action === "show-create") {
    renderCreateForm(button.dataset.type);
  }

  if (button.id === "agentCycleBtn") {
    button.textContent = "Cycle...";
    state = await api("/api/agent-os/run", { method: "POST" });
    button.textContent = "Lancer un cycle agents";
    render();
  }

  if (button.dataset.action === "show-prospect-form") {
    renderProspectForm();
  }

  if (button.dataset.action === "enrich-contact-emails") {
    button.textContent = "Recherche...";
    const payload = await api("/api/agent-os/enrich-contacts", {
      method: "POST",
      body: JSON.stringify({ limit: 10 })
    });
    if (payload?.ok === false) {
      alert(payload.error || "Recherche emails impossible.");
      button.textContent = "Chercher emails";
      return;
    }
    state = payload;
    render();
  }

  if (button.dataset.action === "deep-research") {
    button.textContent = "Analyse...";
    const payload = await api("/api/agent-os/deep-research", {
      method: "POST",
      body: JSON.stringify({ limit: 10 })
    });
    if (payload?.ok === false) {
      alert(payload.error || "Recherche complète impossible.");
      button.textContent = "Recherche complète";
      return;
    }
    state = payload;
    render();
  }

  if (button.dataset.action === "edit-prospect") {
    setView("prospection");
    const prospect = (state.prospects || []).find((item) => item.id === button.dataset.id);
    renderProspectForm(prospect);
  }

  if (button.dataset.action === "draft-approve" || button.dataset.action === "draft-reject") {
    const status = button.dataset.action === "draft-approve" ? "pret_a_envoyer" : "refuse";
    state = await api(`/api/outbox/${button.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    render();
  }

  if (button.dataset.action === "send-zoho") {
    button.textContent = "Envoi...";
    const payload = await api(`/api/outbox/${button.dataset.id}/send`, { method: "POST" });
    if (payload?.ok === false) {
      alert(payload.error || "Envoi impossible.");
      button.textContent = "Envoyer Zoho";
      return;
    }
    state = payload;
    render();
  }

  if (button.dataset.action === "copy-message") {
    await navigator.clipboard.writeText(decodeURIComponent(button.dataset.body));
    button.textContent = "Copié";
    setTimeout(() => (button.textContent = "Copier"), 1200);
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.matches(".status-select") && event.target.dataset.action !== "draft-status") {
    const payload = await api(`/api/opportunities/${event.target.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: event.target.value })
    });
    state = payload;
    render();
  }

  if (event.target.dataset.action === "draft-status") {
    state = await api(`/api/outbox/${event.target.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: event.target.value })
    });
    render();
  }

  if (event.target.id === "messageFilter") {
    const value = event.target.value;
    const messages = value === "Tous" ? state.messages : state.messages.filter((message) => message.engine === value);
    document.querySelector("#messageGrid").innerHTML = messageCards(messages);
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (event.target.id === "passwordForm") {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const status = document.querySelector("#passwordStatus");
    status.textContent = "";

    if (data.newPassword !== data.confirmPassword) {
      status.textContent = "Les deux nouveaux mots de passe ne correspondent pas.";
      return;
    }

    if (String(data.newPassword || "").length < 12) {
      status.textContent = "Choisis au moins 12 caract\u00e8res.";
      return;
    }

    const payload = await api("/api/security/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      })
    });

    if (!payload?.ok) {
      status.textContent = payload?.error || "Impossible de modifier le mot de passe.";
      return;
    }

    event.target.reset();
    status.textContent = "Mot de passe modifi\u00e9. Garde-le bien de c\u00f4t\u00e9.";
    await loadState();
    setView("security");
    return;
  }

  if (event.target.id === "createProspectForm") {
    const data = Object.fromEntries(new FormData(event.target).entries());
    state = await api("/api/prospects", {
      method: "POST",
      body: JSON.stringify(data)
    });
    render();
    setView("outbox");
    return;
  }

  if (event.target.id === "googleProspectForm") {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const status = document.querySelector("#googleProspectStatus");
    status.textContent = "Recherche en cours...";
    const payload = await api("/api/agent-os/google-prospect", {
      method: "POST",
      body: JSON.stringify(data)
    });
    if (payload?.ok === false) {
      status.textContent = payload.error || "Recherche impossible.";
      return;
    }
    state = payload;
    setView("prospection");
    return;
  }

  if (event.target.id === "editProspectForm") {
    const data = Object.fromEntries(new FormData(event.target).entries());
    state = await api(`/api/prospects/${data.id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
    render();
    return;
  }

  if (event.target.id !== "createOppForm") return;

  const data = Object.fromEntries(new FormData(event.target).entries());
  const payload = await api("/api/opportunities", {
    method: "POST",
    body: JSON.stringify(data)
  });
  state = payload;
  render();
});

quickJump.addEventListener("change", (event) => setView(event.target.value));

runCycleBtn.addEventListener("click", async () => {
  runCycleBtn.textContent = "Cycle...";
  state = await api("/api/agent-os/run", { method: "POST" });
  runCycleBtn.textContent = "Lancer cycle";
  render();
});

logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  window.location.href = "/";
});

loadState();

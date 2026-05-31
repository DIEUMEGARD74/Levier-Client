const form = document.querySelector("#loginForm");
const statusNode = document.querySelector("#loginStatus");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusNode.textContent = "Vérification...";
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    statusNode.textContent = payload.error || "Connexion refusée.";
    return;
  }
  window.location.href = "/pilotage";
});

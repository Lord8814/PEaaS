let composants = {};

// ======================================================================
//  Helpers
// ======================================================================

const $ = id => document.getElementById(id);

function afficher(el, html, classe = "") {
  el.className = "statut " + classe;
  el.innerHTML = html;
}

function echapper(s) {
  return String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

// Appel API centralise : toute erreur remonte avec un message lisible
// plutot que de disparaitre dans la console.
async function api(url, corps = null) {
  const options = corps
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : { method: "GET" };

  let reponse;
  try {
    reponse = await fetch(url, options);
  } catch (e) {
    throw new Error("Serveur injoignable : " + e.message);
  }

  const type = reponse.headers.get("content-type") || "";

  if (!reponse.ok) {
    if (type.includes("json")) {
      const json = await reponse.json().catch(() => null);
      throw new Error(json?.erreur || `HTTP ${reponse.status}`);
    }
    throw new Error(`HTTP ${reponse.status} ${reponse.statusText}`);
  }

  return type.includes("json") ? reponse.json() : reponse.text();
}

// Desactive un bouton pendant l'operation pour eviter les doubles clics.
async function pendant(bouton, el, message, tache) {
  bouton.disabled = true;
  afficher(el, message);
  try {
    await tache();
  } catch (e) {
    afficher(el, "Echec : " + echapper(e.message), "erreur");
  } finally {
    bouton.disabled = false;
  }
}

// ======================================================================
//  Onglets
// ======================================================================

document.querySelectorAll(".onglet").forEach(o => {
  o.addEventListener("click", () => {
    document.querySelectorAll(".onglet").forEach(x => x.classList.remove("actif"));
    o.classList.add("actif");
    $("vue-package").classList.toggle("cache", o.dataset.vue !== "package");
    $("vue-tests").classList.toggle("cache", o.dataset.vue !== "tests");
  });
});

// ======================================================================
//  Catalogue et dependances
// ======================================================================

api("/api/components")
  .then(data => { composants = data; afficherListe(data); })
  .catch(e => afficher($("statutPackage"), "Catalogue indisponible : " + echapper(e.message), "erreur"));

function afficherListe(data) {
  const ul = $("liste");
  ul.innerHTML = "";

  for (const [cle, info] of Object.entries(data)) {
    const li = document.createElement("li");
    li.innerHTML = `<label><input type="checkbox" value="${cle}"> ${echapper(info.label)}
      <span class="auto" id="note-${cle}"></span></label>`;
    ul.appendChild(li);
  }

  document.querySelectorAll("input[type=checkbox]")
    .forEach(c => c.addEventListener("change", appliquerDependances));
}

function appliquerDependances() {
  document.querySelectorAll("input[type=checkbox]").forEach(c => {
    c.disabled = false;
    $("note-" + c.value).textContent = "";
  });

  const requis = new Set();
  function ajouter(cle) {
    for (const dep of composants[cle].deps) {
      if (!requis.has(dep)) { requis.add(dep); ajouter(dep); }
    }
  }
  selection().forEach(ajouter);

  requis.forEach(dep => {
    const c = document.querySelector(`input[value="${dep}"]`);
    c.checked = true;
    c.disabled = true;
    $("note-" + dep).textContent = "(requis)";
  });

  afficherIdentifiants();
}

const selection = () => [...document.querySelectorAll("input:checked")].map(c => c.value);

// ======================================================================
//  Identifiants requis par la selection (D-011) — jamais de valeur par
//  defaut : un champ par variable, tant qu'aucun composant qui en a besoin
//  n'est selectionne, la section reste masquee.
// ======================================================================

function identifiantsRequis() {
  const map = new Map(); // variable -> libelle
  selection().forEach(cle => {
    (composants[cle].identifiants || []).forEach(id => {
      if (!map.has(id.variable)) map.set(id.variable, id.libelle);
    });
  });
  return map;
}

function afficherIdentifiants() {
  const bloc = $("identifiants");
  const conteneur = $("identifiants-champs");
  const requis = identifiantsRequis();

  // Conserve la saisie deja faite pour une variable encore requise apres
  // un changement de selection.
  const saisis = new Map(
    [...conteneur.querySelectorAll("input")].map(i => [i.dataset.variable, i.value])
  );

  conteneur.innerHTML = "";
  bloc.classList.toggle("cache", requis.size === 0);

  requis.forEach((libelle, variable) => {
    const label = document.createElement("label");
    label.innerHTML =
      `${echapper(libelle)} <code>${echapper(variable)}</code>
       <input type="password" autocomplete="new-password" data-variable="${echapper(variable)}">`;
    conteneur.appendChild(label);
    if (saisis.has(variable)) label.querySelector("input").value = saisis.get(variable);
  });
}

// { <VARIABLE> : <valeur saisie> } — uniquement les champs actuellement
// affiches (donc requis par la selection courante), valeurs non vides.
function valeursIdentifiants() {
  const v = {};
  document.querySelectorAll("#identifiants-champs input").forEach(i => {
    const val = i.value.trim();
    if (val) v[i.dataset.variable] = val;
  });
  return v;
}

// ======================================================================
//  Multi-site : selecteur de site cible
// ======================================================================

let sitesParId = {};

api("/api/sites")
  .then(afficherSites)
  .catch(() => { /* pas de topologie : generation mono-site, section masquee */ });

function afficherSites(data) {
  sitesParId = {};
  const sel = $("siteCible");
  sel.innerHTML = "";

  data.sites.forEach(s => {
    sitesParId[s.id] = s;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.id} (index ${s.index} → ${s.docker_subnet})`;
    sel.appendChild(opt);
  });

  if (!data.sites.length) return;
  sel.value = data.sites[0].id;
  sel.addEventListener("change", majSite);
  majSite();
  $("multisite").classList.remove("cache");
}

function majSite() {
  const s = sitesParId[$("siteCible").value];
  if (!s) return;
  $("siteAddr").value = s.host_address;
  $("sitePort").value = s.host_port;
  $("siteInfo").textContent =
    `Reseau hote : ${s.host_cidr} — plage Docker calculee : ${s.docker_subnet} ` +
    `(ecrite dans .env) — initiation du lien DMR : ${s.dmr_link_initiator}`;
}

// Corps commun aux requetes /api/compose et /api/package : selection de
// composants + (si multi-site) site cible et surcharges du formulaire.
function corpsGeneration() {
  const body = { composants: selection(), identifiants: valeursIdentifiants() };
  const sel = $("siteCible");

  if (!$("multisite").classList.contains("cache") && sel.value) {
    body.site = sel.value;
    body.overrides = {
      [sel.value]: {
        host_address: $("siteAddr").value.trim(),
        host_port: parseInt($("sitePort").value, 10) || 443
      }
    };
    if ($("regenCert").checked) body.regen_cert = true;
  }
  return body;
}

// ======================================================================
//  Telechargements
// ======================================================================

async function telecharger(url, nomFichier) {
  const choix = selection();
  const el = $("statutPackage");

  if (choix.length === 0) {
    afficher(el, "Selectionnez au moins un composant.", "erreur");
    return;
  }

  afficher(el, "Generation en cours...");

  const reponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpsGeneration())
  });

  if (!reponse.ok) {
    const json = await reponse.json().catch(() => null);
    throw new Error(json?.erreur || `HTTP ${reponse.status}`);
  }

  const blob = await reponse.blob();

  if (blob.size === 0) throw new Error("Archive vide recue");

  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(lien.href);

  const ko = Math.round(blob.size / 1024);
  afficher(el, `${nomFichier} telecharge (${ko} Ko)`, "succes");
}

$("generer").addEventListener("click", e =>
  pendant(e.target, $("statutPackage"), "Generation...",
    () => telecharger("/api/package", "peaas-package.tar.gz")));

$("composeSeul").addEventListener("click", e =>
  pendant(e.target, $("statutPackage"), "Generation...",
    () => telecharger("/api/compose", "docker-compose.yaml")));

$("apercu").addEventListener("click", e =>
  pendant(e.target, $("statutPackage"), "Chargement...", async () => {
    const choix = selection();
    if (choix.length === 0) throw new Error("Selectionnez au moins un composant");

    const yaml = await api("/api/compose", corpsGeneration());
    const pre = $("apercuCompose");
    pre.textContent = yaml;
    pre.classList.remove("cache");
    afficher($("statutPackage"), `${choix.length} selectionne(s), dependances incluses`, "succes");
  }));

// ======================================================================
//  Tests
// ======================================================================

$("btnHealth").addEventListener("click", e =>
  pendant(e.target, $("resHealth"), "Verification...", async () => {
    const { resultats } = await api("/api/health");

    const lignes = resultats.map(r => `<tr>
      <td>${echapper(r.nom)}</td>
      <td>${r.joignable ? "joignable" : "<span class='erreur'>injoignable</span>"}</td>
      <td>${r.status || "-"}</td>
      <td>${r.duree} ms</td>
      <td>${r.erreur ? echapper(r.erreur) : ""}</td>
    </tr>`).join("");

    afficher($("resHealth"),
      `<table><tr><th>Composant</th><th>Etat</th><th>HTTP</th><th>Duree</th><th>Detail</th></tr>
       ${lignes}</table>`);
  }));

$("btnLb").addEventListener("click", e =>
  pendant(e.target, $("resLb"), "Appels en cours...", async () => {
    const n = parseInt($("lbIterations").value) || 20;
    const d = await api("/api/test/loadbalancing", {
      iterations: n,
      route: $("lbRoute").value
    });

    const max = Math.max(...Object.values(d.compteurs), 1);

    const repartition = Object.entries(d.compteurs).map(([nom, cpt]) => `<tr>
      <td>${echapper(nom)}</td>
      <td><span class="barre" style="width:${(cpt / max) * 160}px"></span>${cpt}</td>
      <td>${Math.round((cpt / d.total) * 100)} %</td>
    </tr>`).join("");

    const lat = d.latence
      ? `Latence : min ${d.latence.min} ms, moyenne ${d.latence.moyenne} ms, max ${d.latence.max} ms`
      : "";

    const detail = d.appels.map(a =>
      a.ok ? `${String(a.i).padStart(3)} | ${a.instance} | ${a.duree} ms`
           : `${String(a.i).padStart(3)} | ECHEC : ${a.erreur}`
    ).join("\n");

    afficher($("resLb"), `
      <p><strong>${d.route}</strong> — ${d.total}/${d.iterations} appels reussis
      ${d.echecs ? `<span class="erreur">(${d.echecs} echec(s))</span>` : ""}</p>
      <table><tr><th>Instance</th><th>Appels</th><th>Part</th></tr>${repartition}</table>
      <p class="aide">${lat}</p>
      <pre>${echapper(detail)}</pre>`,
      d.echecs ? "" : "succes");
  }));

$("btnDb").addEventListener("click", e =>
  pendant(e.target, $("resDb"), "Insertion puis recherche...", async () => {
    const d = await api("/api/test/database", { valeur: $("dbValeur").value || undefined });

    if (d.etape === "insertion") {
      afficher($("resDb"),
        `Echec a l'insertion : ${echapper(d.erreur)}<pre>${echapper(d.corps || "")}</pre>`,
        "erreur");
      return;
    }

    afficher($("resDb"), `
      <p>Valeur testee : <code>${echapper(d.valeur)}</code></p>
      <table>
        <tr><th>Etape</th><th>Instance</th><th>Duree</th><th>Resultat</th></tr>
        <tr><td>Insertion</td><td>${echapper(d.insertion.instance || "?")}</td>
            <td>${d.insertion.duree} ms</td><td>OK</td></tr>
        <tr><td>Recherche</td><td>${echapper(d.recherche.instance || "?")}</td>
            <td>${d.recherche.duree} ms</td>
            <td>${d.recherche.ok ? "OK" : "<span class='erreur'>" + echapper(d.recherche.erreur) + "</span>"}</td></tr>
      </table>
      <pre>${echapper(d.recherche.corps || "")}</pre>`,
      d.recherche.ok ? "succes" : "erreur");
  }));

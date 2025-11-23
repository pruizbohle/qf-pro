import { mountHeader } from "./header.js";
import { FichasStore } from "./fichasStore.js";
import { loadAll as loadMeds } from "./medStore.js";
import { evaluarCriterios, evaluarInteracciones } from "./rulesEngine.js";

/* ======= UTILIDADES DOM ======= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (ts) => new Date(ts).toLocaleString("es-CL");
const debounce = (fn, ms = 500) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
const uuid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "R" + Math.random().toString(36).slice(2, 9).toUpperCase();

const escapeHtml = (str = "") =>
  str.replace(/[&<>"']/g, (ch) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }
    )[ch] || ch
  );

    /* ======= ESTADO GLOBAL ======= */
const ALL_TABS = ["ficha", "ante", "anam", "meds", "ea", "prm", "edu", "herr", "indi", "acu"];
const FLOW = {
  "SIN ENTREVISTA: CONCILIACIÓN": ["ficha", "ante", "meds", "prm", "herr", "indi"],
  "SIN ENTREVISTA: RAM": ["ficha", "ante", "anam", "ea", "meds", "prm", "indi"],
  "CON ENTREVISTA: REGULAR": ["ficha", "ante", "anam", "meds", "ea", "prm", "edu", "indi"],
  "CON ENTREVISTA: AMPLIADA": ["ficha", "ante", "anam", "meds", "ea", "prm", "edu", "herr", "indi", "acu"],
};

const tiposBtns = [
  { id: "tipo-sinconc", label: "SIN ENTREVISTA: CONCILIACIÓN" },
  { id: "tipo-sinram", label: "SIN ENTREVISTA: RAM" },
  { id: "tipo-conreg", label: "CON ENTREVISTA: REGULAR" },
  { id: "tipo-conmais", label: "CON ENTREVISTA: AMPLIADA" },
];

const ANT_SUG = [
  "HTA",
  "DM2 IR",
  "DM2 NIR",
  "ARTROSIS",
  "AR",
  "DLP",
  "IC",
  "HIPOT4",
  "OB",
  "TR SUEÑO",
  "TR DEPRESIVO",
  "TR ANSIOSO",
  "TR MIXTO",
  "ASMA",
  "EPOC",
  "HBP",
];

const state = {
  activeId: null,
  tipoSeleccionado: null,
  medsDB: null,
  criterios: null,
  interacciones: null,
  plantas: {},
};

const autosave = { el: null };

const originalUpdate = FichasStore.update.bind(FichasStore);
FichasStore.update = function (id, mutator) {
  const updated = originalUpdate(id, mutator);
  if (state.activeId === id) {
    updateAutosaveIndicator(updated);
  }
  return updated;
};

/* ======= INICIALIZACIÓN ======= */
init();

async function init() {
  mountHeader();
  setupAutosaveIndicator();

  setupTabs();
    noFichaState();
  setupTipoAtencion();
  setupCrearFicha();
  setupAntecedentes();
  setupRayenDxImporter();
  setupConciliacion();
  setupErrores();

  await Promise.all([
    loadMedicamentos(),
    loadCriterios(),
    loadInteracciones(),
    loadPlantas(),
  ]);

  renderLista();
  if (!state.activeId) noFichaState();  if (!state.activeId) noFichaState();

  const hashId = (location.hash || "").replace("#", "").toUpperCase();
  if (hashId && FichasStore.get(hashId)) {
    openFicha(hashId);
  }

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace("#", "").toUpperCase();
    if (h && FichasStore.get(h)) openFicha(h);
  });
}

/* ======= CARGA DE DATOS ======= */
async function loadMedicamentos() {
  state.medsDB = await loadMeds();
}
async function loadCriterios() {
  try {
    const data = await fetch("../data/criterios.json").then((r) => r.json());
    state.criterios = data;
  } catch (err) {
    console.error("❌ No fue posible cargar criterios.json", err);
    state.criterios = null;
  }
}
async function loadInteracciones() {
  try {
    const data = await fetch("../data/interacciones.json").then((r) => r.json());
    state.interacciones = data;
  } catch (err) {
    console.error("❌ No fue posible cargar interacciones.json", err);
    state.interacciones = null;
  }
}
async function loadPlantas() {
  try {
    const data = await fetch("../data/plantas.json").then((r) => r.json());
    state.plantas = data || {};
    const sel = $("#pl-sel");
    if (sel) {
      sel.innerHTML = Object.values(state.plantas)
        .map((p) => `<option value="${p.id}">${p.nombre}</option>`)
        .join("");
    }
  } catch (err) {
    console.error("❌ No fue posible cargar plantas.json", err);
  }
}

/* ======= TABS ======= */
function setupTabs() {
  showTab("ficha");
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      if (!state.activeId && tab !== "ficha") return;
      showTab(tab);
    });
  });
}

function showTab(key) {
  ALL_TABS.forEach((t) => {
    const panel = document.querySelector(`#panel-${t}`);
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    if (panel) panel.style.display = t === key ? "block" : "none";
    if (btn) btn.classList.toggle("active", t === key);
  });
}

function aplicarTabsPorTipo(tipo) {
  const keep = new Set(FLOW[tipo] || ["ficha", "ante"]);
  ALL_TABS.forEach((t) => {
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    const panel = document.querySelector(`#panel-${t}`);
    const visible = keep.has(t);
    if (btn) btn.style.display = visible ? "inline-flex" : "none";
    if (panel) panel.style.display = visible && t === "ante" ? "block" : "none";
  });
  if (keep.has("ante")) showTab("ante");
  else showTab("ficha");
}

function noFichaState() {
  state.activeId = null;
  window.activeId = null;
    updateAutosaveIndicator(null);
  const header = $("#header-paciente");
  if (header) {
    header.style.display = "block";
    header.textContent = "Sin ficha abierta";
  }
    marcarTipo(null);
  const keep = new Set(["ficha"]);
  ALL_TABS.forEach((t) => {
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    const panel = document.querySelector(`#panel-${t}`);
    const visible = keep.has(t);
    if (btn) btn.style.display = visible ? "inline-flex" : "none";
    if (panel) panel.style.display = visible ? "block" : "none";
  });
  const resetMap = [
    ["#conciliacion-list", '<li class="muted-card">— sin datos —</li>'],
    ["#errores-list", '<li class="muted-card">— sin ficha —</li>'],
    ["#aps-recetas", '<div class="muted-card">— sin ficha —</div>'],
    ["#sec-recetas", '<div class="muted-card">— sin ficha —</div>'],
    ["#extra-box", '<div class="muted-card">— sin ficha —</div>'],
    ["#auto-list", '<li class="muted-card">— sin ficha —</li>'],
    ["#pl-list", '<li class="muted-card">— sin ficha —</li>'],
    ["#ea-out", '<div class="muted">— sin ficha —</div>'],
    ["#prm-auto", '<div class="muted">— sin ficha —</div>'],
  ];
  resetMap.forEach(([sel, html]) => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = html;
  });
  renderAntecedentes();
  renderHerramientas();
}

function setupAutosaveIndicator() {
  autosave.el = document.getElementById("autosave-indicator");
  updateAutosaveIndicator(state.activeId ? FichasStore.get(state.activeId) : null);
}

function updateAutosaveIndicator(ficha) {
  if (!autosave.el) return;
  if (!ficha) {
    autosave.el.textContent = "Autoguardado: —";
    autosave.el.classList.add("muted");
    autosave.el.classList.remove("autosave--active");
    return;
  }
  const ts = ficha.lastActive || Date.now();
  const time = new Date(ts).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  autosave.el.textContent = `Autoguardado: ${time}`;
  autosave.el.classList.remove("muted");
  autosave.el.classList.add("autosave--active");
}

/* ======= CREAR/ABRIR FICHAS ======= */
function setupTipoAtencion() {
  tiposBtns.forEach((t) => {
    const btn = document.getElementById(t.id);
    if (!btn) return;
    btn.addEventListener("click", () => marcarTipo(t.id));
  });
}

function marcarTipo(btnId) {
  const obj = tiposBtns.find((t) => t.id === btnId);
  state.tipoSeleccionado = obj ? obj.label : null;
  tiposBtns.forEach((t) => {
    const b = document.getElementById(t.id);
    if (!b) return;
    if (t.id === btnId) {
      b.classList.add("active");
      b.style.background = "#1a3a69";
    } else {
      b.classList.remove("active");
      b.style.background = "#101c33";
    }
  });
}

function setupCrearFicha() {
  const ini = $("#ini");
    const mayor65 = $("#mayor65");
  const sexo = $("#sexo");
  const btn = $("#btn-crear");
  if (!ini || !btn) return;
    ini.addEventListener("input", (e) => normalizarIniciales(e.target));
  mayor65?.addEventListener("change", () => {
    updateChips();
    syncAge65WithFicha();
  });
  sexo?.addEventListener("change", () => {
    updateChips();
    syncSexoWithFicha();
  });
  updateChips();
  btn.addEventListener("click", () => crearFicha());
}

function normalizarIniciales(input) {
  if (!input) return;
  const clean = (input.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (input.value !== clean) {
    input.value = clean;
  }
}

function updateChips() {
  const mayor65 = $("#mayor65");
  const sexo = $("#sexo");
  const chip65 = $("#chip-65");
  const chipEmb = $("#chip-emb");
  const wrapEmb = $("#wrap-embarazo");
  const es65 = !!mayor65?.checked;
  const esF = sexo?.value === "F";
  if (chip65) chip65.style.display = es65 ? "inline-flex" : "none";
  if (chipEmb) chipEmb.style.display = esF && !es65 ? "inline-flex" : "none";
    if (wrapEmb) {
    const visible = esF && !es65;
    wrapEmb.style.display = visible ? "inline-flex" : "none";
    if (!visible) {
      const chk = $("#ant-embarazo");
      if (chk && chk.checked) {
        chk.checked = false;
        setAntecedenteFlag("embarazo", false);
      }
    }
  }
}

function syncAge65WithFicha() {
  if (!state.activeId) return;
  const mayor65 = $("#mayor65");
  const es65 = !!mayor65?.checked;
  FichasStore.update(state.activeId, (f) => {
    f.age65 = es65;
  });
  const ficha = FichasStore.get(state.activeId);
  updateHeaderPaciente(ficha);
  renderLista();
  computePRM();
}

function syncSexoWithFicha() {
  if (!state.activeId) return;
  const sexo = $("#sexo");
  const value = sexo?.value || "";
  FichasStore.update(state.activeId, (f) => {
    f.sexo = value;
  });
  const ficha = FichasStore.get(state.activeId);
  updateHeaderPaciente(ficha);
  renderLista();
  computePRM();
}

function crearFicha() {
  const ini = $("#ini");
  const mayor65 = $("#mayor65");
  const sexo = $("#sexo");
    normalizarIniciales(ini);
  const iniciales = (ini?.value || "").trim().toUpperCase();
  const id = iniciales.replace(/[^A-Z]/g, "").slice(0, 3);
  if (!id || id.length !== 3) {
    alert("Debes ingresar 3 letras para las iniciales.");
    return;
  }
  if (!sexo?.value) {
    alert("Selecciona el sexo del paciente.");
    return;
  }
  if (!state.tipoSeleccionado) {
    alert("Selecciona un tipo de atención.");
    return;
  }

  const payload = {
    age65: !!mayor65?.checked,
    sexo: sexo.value,
    tipoAtencion: state.tipoSeleccionado,
  };

  let existed = false;
  try {
    FichasStore.create(id, payload);
  } catch (err) {
    if (/Ya existe/.test(err.message)) {
      existed = true;
    } else {
      alert(err.message);
      return;
    }
  }

  FichasStore.update(id, (f) => {
    f.age65 = payload.age65;
    f.sexo = payload.sexo;
    f.tipoAtencion = payload.tipoAtencion;
  });

  renderLista();
  openFicha(id);
  if (ini) ini.value = "";
  if (existed) {
    notify("Ficha abierta", `Se reabrió la ficha ${id} conservando su información.`);
  }
}

function openFicha(id) {
  const ficha = FichasStore.get(id);
  if (!ficha) return;
  state.activeId = id;
  window.activeId = id;
  FichasStore.update(id, () => {});
  const refreshed = FichasStore.get(id);
  updateAutosaveIndicator(refreshed);
  updateHeaderPaciente(refreshed);
  aplicarTabsPorTipo(refreshed?.tipoAtencion);
  syncFormulario(refreshed);
  renderLista();
  renderAntecedentes();
  renderMedicamentos();
  renderConciliacion();
  renderHerramientas();
  renderErrores();
  renderEA();
  computePRM();
}

function syncFormulario(ficha) {
  const ini = $("#ini");
  const mayor65 = $("#mayor65");
  const sexo = $("#sexo");
 if (ini) {
    ini.value = ficha?.id || "";
    normalizarIniciales(ini);
  }
  if (mayor65) mayor65.checked = !!ficha?.age65;
  if (sexo) sexo.value = ficha?.sexo || "";
  updateChips();
  const tipoEntry = tiposBtns.find((t) => t.label === ficha?.tipoAtencion);
 marcarTipo(tipoEntry ? tipoEntry.id : null);
}

function updateHeaderPaciente(ficha) {
  const header = $("#header-paciente");
  if (!header) return;
  if (!ficha) {
    header.style.display = "none";
    header.textContent = "";
    return;
  }
  const sexoTxt = ficha.sexo === "F" ? "Femenino" : ficha.sexo === "M" ? "Masculino" : "-";
  const tipoRaw = ficha.tipoAtencion;
  let tipoEtiqueta = "—";
  if (typeof tipoRaw === "string" && tipoRaw.trim()) {
    const partes = tipoRaw.split(":");
    const posibleEtiqueta = partes[partes.length - 1]?.trim();
    tipoEtiqueta = posibleEtiqueta || tipoRaw.trim() || "—";
  }
  const secciones = [ficha.id || "-", sexoTxt];
  if (ficha.age65) {
    secciones.push("≥65");
  }
  secciones.push(tipoEtiqueta);
  header.textContent = secciones.filter(Boolean).join(" · ");
  header.style.display = "block";
}

function renderLista() {
  const cont = $("#lista-fichas");
  if (!cont) return;
  const fichas = FichasStore.list()
    .slice()
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  if (!fichas.length) {
    cont.innerHTML = "— sin fichas abiertas —";
    return;
  }
  cont.innerHTML = "";
  fichas.forEach((f) => {
    const card = document.createElement("div");
    card.className = "ficha-card" + (state.activeId === f.id ? " active" : "");
    const icon =
      f.sexo === "F"
        ? '<span class="sexo-f">♀</span>'
        : f.sexo === "M"
        ? '<span class="sexo-m">♂</span>'
        : "•";
    const chip = f.age65 ? '<span class="chip" style="margin-left:6px;">≥65</span>' : "";
    const fecha = f.lastActive ? fmt(f.lastActive) : "";
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div><strong>${f.id}</strong> ${icon} ${chip}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn mini" data-open="${f.id}">Abrir</button>
          <button class="btn mini warn" data-del="${f.id}" title="Eliminar ficha">🗑️</button>
        </div>
      </div>
      <div class="muted" style="font-size:12px;">${fecha}</div>
    `;
    card.querySelector("[data-open]")?.addEventListener("click", () => openFicha(f.id));
    card.querySelector("[data-del]")?.addEventListener("click", () => eliminarFicha(f.id));
    cont.appendChild(card);
  });
}

function eliminarFicha(id) {
  if (!confirm(`¿Eliminar ficha ${id}?`)) return;
  FichasStore.remove(id);
  if (state.activeId === id) {
    state.activeId = null;
    noFichaState();
  }
  renderLista();
}

function notify(title, message) {
  console.log(title, message);
}

/* ======= ANTECEDENTES ======= */

function setAntecedenteFlag(key, value) {
  if (!state.activeId) return;
  FichasStore.update(state.activeId, (f) => {
    f.anamnesis = f.anamnesis || {};
    f.anamnesis.flags = { ...(f.anamnesis.flags || {}) };
    f.anamnesis.flags[key] = value;
  });
}

function setupAntecedentes() {
  const datalist = $("#ant-suggest");
  if (datalist) {
    datalist.innerHTML = ANT_SUG.map((x) => `<option value="${x}">${x}</option>`).join("");
  }
  const input = $("#ant-input");
  input?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const value = (input.value || "").trim();
    if (!value || !state.activeId) return;
    input.value = "";
    FichasStore.update(state.activeId, (f) => {
      f.anamnesis = f.anamnesis || { antecedentes: [] };
      const arr = f.anamnesis.antecedentes || [];
      if (!arr.includes(value)) arr.push(value);
      f.anamnesis.antecedentes = arr;
    });
    renderAntecedentes();
    computePRM();
  });
  
  const antIam = $("#ant-iamacv");
  const antErc = $("#ant-erc");
  const antEmb = $("#ant-embarazo");
  const antPdcBtn = $("#ant-pdc-btn");

  antIam?.addEventListener("change", (e) => {
    if (!state.activeId) return;
    setAntecedenteFlag("antIAMACV", !!e.target.checked);
    renderAntecedentes();
  });

  antErc?.addEventListener("change", (e) => {
    if (!state.activeId) return;
    setAntecedenteFlag("erc", !!e.target.checked);
    renderAntecedentes();
    computePRM();
  });

  antEmb?.addEventListener("change", (e) => {
    if (!state.activeId) return;
    setAntecedenteFlag("embarazo", !!e.target.checked);
    renderAntecedentes();
  });
  
  antPdcBtn?.addEventListener("click", () => {
    if (!state.activeId) {
      alert("Abre una ficha primero.");
      return;
    }
    const params = new URLSearchParams({
      group: "adh",
      tool: "adh-pdc",
      ficha: state.activeId,
    });
    window.location.href = `../sections/herramientas.html?${params.toString()}`;
  });
}

function renderAntecedentes() {
  const host = $("#ant-list");
  if (!host) return;
  const antIam = $("#ant-iamacv");
  const antErc = $("#ant-erc");
  const antEmb = $("#ant-embarazo");
  const antPdcPill = $("#ant-pdc-pill");
  const antPdcEmpty = $("#ant-pdc-empty");
  host.innerHTML = "";
    if (!state.activeId) {
    if (antIam) antIam.checked = false;
    if (antErc) antErc.checked = false;
    if (antEmb) antEmb.checked = false;
        if (antPdcPill) {
      antPdcPill.textContent = "";
      antPdcPill.style.display = "none";
    }
    if (antPdcEmpty) {
      antPdcEmpty.style.display = "inline";
    }
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const flags = ficha?.anamnesis?.flags || {};
  if (antIam) antIam.checked = !!flags.antIAMACV;
  if (antErc) antErc.checked = !!flags.erc;
  if (antEmb) antEmb.checked = !!flags.embarazo;
  const pdcTxt = ficha?.anamnesis?.adherencia?.pdc || "";
  if (antPdcPill) {
    antPdcPill.textContent = pdcTxt;
    antPdcPill.style.display = pdcTxt ? "inline-flex" : "none";
  }
  if (antPdcEmpty) {
    antPdcEmpty.style.display = pdcTxt ? "none" : "inline";
  }
  (ficha?.anamnesis?.antecedentes || []).forEach((val) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = val;
    const close = document.createElement("span");
    close.className = "trash";
    close.title = "Quitar";
    close.textContent = "✕";
    close.addEventListener("click", () => {
      FichasStore.update(state.activeId, (f) => {
        f.anamnesis = f.anamnesis || { antecedentes: [] };
        f.anamnesis.antecedentes = (f.anamnesis.antecedentes || []).filter((x) => x !== val);
      });
      renderAntecedentes();
      computePRM();
    });
    chip.appendChild(close);
    host.appendChild(chip);
  });
}

const DX_PATTERNS = [
  { regex: /HIPERTENSI/i, chip: "HTA" },
  { regex: /DIABETES[^\n]*INSULINODEP/i, chip: "DM2 IR" },
  { regex: /DIABETES[^\n]*(NO\s+INSULIN|NIR)/i, chip: "DM2 NIR" },
  { regex: /DIABETES/i, chip: "DM2 NIR" },
  { regex: /INSUFICIENCIA\s+CARDIAC/i, chip: "IC" },
  { regex: /HIPOTIROID/i, chip: "HIPOT4" },
  { regex: /DISLIPID|TRIGLICERID|COLESTER|HIPERTRIG/i, chip: "DLP" },
  { regex: /ARTROSIS|GONARTROSIS|COXARTROSIS|OSTEOARTROSIS|POLIARTROSIS/i, chip: "ARTROSIS" },
  { regex: /ARTRITIS\s+REUMATOID/i, chip: "AR" },
  { regex: /SUEÑO|INSOMNIO/i, chip: "TR SUEÑO" },
  { regex: /ASMA/i, chip: "ASMA" },
  { regex: /EPOC|ENFERMEDAD\s+PULMONAR\s+OBSTRUCTIVA\s+CR[ÓO]NICA/i, chip: "EPOC" },
  { regex: /HBP|HIPERPLASIA\s+BENIGNA\s+PROSTAT/i, chip: "HBP" },
  { regex: /DEPRESI/i, chip: "TR DEPRESIVO" },
  { regex: /ANSIEDAD|ANSIOS/i, chip: "TR ANSIOSO" },
  { regex: /MIXT/i, chip: "TR MIXTO" },
];

function mapRayenDxToChip(diag = "") {
  for (const { regex, chip } of DX_PATTERNS) {
    if (regex.test(diag)) return chip;
  }
  return null;
}

function parseRayenDiagnosticos(raw = "") {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const chips = new Set();
  let hasFA = false;
  for (const line of lines) {
    const clean = line.replace(/^\(?\d+\)?\s*/, "");
    const diag = clean
      .replace(/\([^)]*\)/g, " ")
      .replace(/[.,;:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!diag) continue;
    if (/FIBRILACION|ALETEO\s+AURIC|\bFA\b/i.test(diag)) {
      hasFA = true;
    }
    const chip = mapRayenDxToChip(diag.toUpperCase());
    if (chip) chips.add(chip);
  }
  if (hasFA && chips.has("IC")) {
    chips.delete("IC");
    chips.add("IC x FA");
  }
  return Array.from(chips);
}

function setupRayenDxImporter() {
  const btn = $("#btn-import-dx-rayen");
  const modal = $("#import-rayen-dx-modal");
  const area = $("#rayen-dx-input");
  const cancel = $("#rayen-dx-cancel");
  const process = $("#rayen-dx-process");
  btn?.addEventListener("click", () => {
    if (!state.activeId) {
      alert("Abre una ficha primero.");
      return;
    }
    if (modal) modal.style.display = "flex";
  });
  cancel?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
    if (area) area.value = "";
  });
  process?.addEventListener("click", () => {
    if (!state.activeId) {
      alert("Abre una ficha primero.");
      return;
    }
    const raw = area?.value.trim();
    if (!raw) {
      alert("Pega el listado de Rayen para procesar.");
      return;
    }
    const chips = parseRayenDiagnosticos(raw);
    if (!chips.length) {
      alert("No se encontraron diagnósticos reconocibles en el texto pegado.");
      return;
    }
    FichasStore.update(state.activeId, (f) => {
      f.anamnesis = f.anamnesis || { antecedentes: [] };
      const arr = f.anamnesis.antecedentes || [];
      chips.forEach((chip) => {
        if (!arr.includes(chip)) arr.push(chip);
      });
      f.anamnesis.antecedentes = arr;
    });
    renderAntecedentes();
    computePRM();
    if (modal) modal.style.display = "none";
    if (area) area.value = "";
    alert(`Diagnósticos importados: ${chips.join(", ")}`);
  });
}

function renderHerramientas() {
  const host = $("#herr-out");
  if (!host) return;
  if (!state.activeId) {
    host.innerHTML = '<div class="muted">— sin ficha —</div>';
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const tests = Array.isArray(ficha?.tests) ? ficha.tests : [];
  const calculos = Array.isArray(ficha?.calculos) ? ficha.calculos : [];
  const items = [
    ...tests.map((item) => ({ ...item, kind: "Test" })),
    ...calculos.map((item) => ({ ...item, kind: "Cálculo" })),
  ].filter((item) => item && (item.resultado || item.tipo));
  if (!items.length) {
    host.innerHTML = '<div class="muted">— sin resultados aún —</div>';
    return;
  }
  items.sort((a, b) => (b?.fecha || 0) - (a?.fecha || 0));
  host.innerHTML = items
    .map((item) => {
      const tipo = escapeHtml(item?.tipo || item?.kind || "Herramienta");
      const res = escapeHtml(item?.resultado || "");
      const fecha = item?.fecha ? fmt(item.fecha) : null;
      const badge = item?.kind ? item.kind : "";
      const meta = fecha || badge
        ? `<div class="muted" style="margin-top:4px">${[badge, fecha].filter(Boolean).join(" · ")}</div>`
        : "";
      return `
        <div class="muted-card">
          <strong>${tipo}</strong>
          <div style="margin-top:6px">${res || ""}</div>
          ${meta}
        </div>`;
    })
    .join("");
}

/* ======= CONCILIACIÓN / ERRORES ======= */
function setupConciliacion() {
  renderConciliacion();
}

function renderConciliacion() {
  const list = $("#conciliacion-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.activeId) {
    list.innerHTML = '<li class="muted-card">— sin datos —</li>';
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const meds = getAllMeds(ficha);
  const duplicados = detectarDuplicados(meds);
  if (!duplicados.length) {
    list.innerHTML = '<li class="muted-card">— sin duplicidades detectadas —</li>';
    return;
  }
    const ordenados = duplicados.slice().sort((a, b) => a.base.localeCompare(b.base));
  list.innerHTML = ordenados
    .map((dup) => {
      const detalle = [];
      const usados = new Set();
      dup.meds.forEach((m) => {
        const key = `${m.origen || ""}:${m.recetaId || m.id || ""}`;
        if (usados.has(key)) return;
        usados.add(key);
        const nombre = (m.nombre || dup.base || "").toUpperCase();
        const origen = m.origen || "Receta";
        detalle.push(
          `<div class="conciliacion-med"><span>${escapeHtml(nombre)}</span><span class="muted">${escapeHtml(origen)}</span></div>`
        );
      });
      return `
        <li class="warn-card">
          <strong>${escapeHtml(dup.base)}</strong>
          <div class="conciliacion-medlist">${detalle.join("")}</div>
        </li>`;
    })
    .join("");
}

const ERROR_TEMPLATES = [
  { id: "dup", etapa: "Prescripción", titulo: "Duplicación terapéutica (recetas vigentes).", requiereMed: false },
  { id: "freq", etapa: "Prescripción", titulo: "Frecuencia de administración incorrecta", requiereMed: true },
  { id: "dosis", etapa: "Prescripción", titulo: "Dosis incorrecta", requiereMed: true },
  { id: "forma", etapa: "Prescripción", titulo: "Forma farmacéutica incorrecta", requiereMed: true },
  { id: "duracion", etapa: "Prescripción", titulo: "Duración de tratamiento incorrecto", requiereMed: true },
];

function buildMedLabel(med) {
  const parts = [];
  const nombre = (med?.nombre || med?.base || "").trim();
  const upperNombre = nombre.toUpperCase();
  if (upperNombre) parts.push(upperNombre);
  const presentacion = (med?.presentacion || "").trim();
  if (presentacion && !upperNombre.includes(presentacion.toUpperCase())) parts.push(presentacion);
  if (med?.origen) parts.push(med.origen);
  return parts.join(" · ") || "MEDICAMENTO";
}

function renderErrorTemplates() {
  const host = $("#err-templates");
  if (!host) return;
  host.innerHTML = "";
  if (!state.activeId) {
    host.innerHTML = '<div class="muted-card">— sin ficha —</div>';
    return;
  }
  const currentSelected = host.querySelector("#err-template-select")?.value || ERROR_TEMPLATES[0]?.id;
  const ficha = FichasStore.get(state.activeId);
  const meds = getAllMeds(ficha);
  const medLabels = [];
  const seen = new Set();
  meds.forEach((m) => {
    const label = buildMedLabel(m);
    if (!label || seen.has(label)) return;
    medLabels.push(label);
    seen.add(label);
  });

  const card = document.createElement("div");
  card.className = "muted-card err-template err-form";

  const tplRow = document.createElement("div");
  tplRow.className = "err-row";
  const tplSelect = document.createElement("select");
  tplSelect.id = "err-template-select";
  ERROR_TEMPLATES.forEach((tpl) => {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = `${tpl.etapa}: ${tpl.titulo}`;
    tplSelect.appendChild(opt);
  });
  if (currentSelected) tplSelect.value = currentSelected;
  tplRow.appendChild(tplSelect);

  const medRow = document.createElement("div");
  medRow.className = "err-row";
  const medSelect = document.createElement("select");
  medSelect.id = "err-med-select";
  medSelect.className = "err-med-select";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Selecciona medicamento";
  medSelect.appendChild(defaultOpt);
  medLabels.forEach((lab) => {
    const opt = document.createElement("option");
    opt.value = lab;
    opt.textContent = lab;
    medSelect.appendChild(opt);
  });
  medRow.appendChild(medSelect);

  const medHint = document.createElement("div");
  medHint.className = "muted";
  medHint.textContent = "No hay medicamentos en la ficha.";
  medHint.style.display = "none";

  const actionsRow = document.createElement("div");
  actionsRow.className = "err-actions-row";
  const addBtn = document.createElement("button");
  addBtn.className = "btn mini";
  addBtn.textContent = "Agregar";
  actionsRow.appendChild(addBtn);
  actionsRow.appendChild(medHint);

  const refreshMedControls = () => {
    const tpl = ERROR_TEMPLATES.find((t) => t.id === tplSelect.value);
    const requiresMed = tpl?.requiereMed;
    medRow.style.display = requiresMed ? "flex" : "none";
    medSelect.disabled = requiresMed && !medLabels.length;
    medHint.style.display = requiresMed && !medLabels.length ? "block" : "none";
    if (!requiresMed) medSelect.value = "";
    addBtn.disabled = !tpl || (requiresMed && !medLabels.length);
  };

  tplSelect.addEventListener("change", refreshMedControls);

  addBtn.addEventListener("click", () => {
    if (!state.activeId) {
      alert("Abre una ficha primero.");
      return;
    }
    const tpl = ERROR_TEMPLATES.find((t) => t.id === tplSelect.value);
    if (!tpl) return;
    let medLabel = null;
    if (tpl.requiereMed) {
      medLabel = medSelect.value || null;
      if (!medLabel) {
        alert("Selecciona un medicamento de la ficha.");
        return;
      }
    }
    const desc = medLabel ? `${tpl.titulo} — ${medLabel}` : tpl.titulo;
    addMedError(tpl.etapa, desc, medLabel);
    medSelect.value = "";
  });

  card.appendChild(tplRow);
  card.appendChild(medRow);
  card.appendChild(actionsRow);
  host.appendChild(card);
  refreshMedControls();
}

function addMedError(etapa, desc, medLabel = null) {
  if (!state.activeId) return;
  FichasStore.update(state.activeId, (f) => {
    f.meds = f.meds || {};
    f.meds.errores = f.meds.errores || [];
    f.meds.errores.push({ etapa, desc, med: medLabel, ts: Date.now() });
  });
  renderLista();
  renderErrores();
  renderErrorTemplates();
  computePRM();
}

function removeMedError(index) {
  if (!state.activeId) return;
  FichasStore.update(state.activeId, (f) => {
    const arr = f?.meds?.errores;
    if (!arr || !Array.isArray(arr)) return;
    arr.splice(index, 1);
  });
  renderErrores();
  computePRM();
}

function setupErrores() {
  renderErrorTemplates();
}

function renderErrores() {
  const list = $("#errores-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.activeId) {
    list.innerHTML = '<li class="muted-card">— sin datos —</li>';
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const arr = ficha?.meds?.errores || [];
  if (!arr.length) {
    list.innerHTML = '<li class="muted-card">— sin errores —</li>';
    return;
  }
  arr.slice().reverse().forEach((err, idx) => {
    const originalIndex = arr.length - 1 - idx;
    const li = document.createElement("li");
    const medTxt = err.med ? `<div class="pill" style="margin-top:6px">${escapeHtml(err.med)}</div>` : "";
    const header = document.createElement("div");
    header.className = "err-actions-row";
    const title = document.createElement("div");
    title.innerHTML = `<strong>${escapeHtml(err.etapa || "Error")}</strong>`;
    const delBtn = document.createElement("button");
    delBtn.className = "btn mini";
    delBtn.textContent = "Eliminar";
    delBtn.addEventListener("click", () => removeMedError(originalIndex));
    header.appendChild(title);
    header.appendChild(delBtn);

    const desc = document.createElement("div");
    desc.className = "muted";
    desc.textContent = err.desc || "";
    li.appendChild(header);
    li.appendChild(desc);
    if (medTxt) li.insertAdjacentHTML("beforeend", medTxt);
    list.appendChild(li);
  });
}

/* ======= MEDICAMENTOS ======= */
function esSinEntrevista(tipo) {
  return typeof tipo === "string" && tipo.toUpperCase().startsWith("SIN ENTREVISTA");
}

function toggleMedSub(selector, visible) {
  const node = $(selector);
  if (!node) return;
  node.style.display = visible ? "flex" : "none";
  if (!visible) {
    node.setAttribute("aria-hidden", "true");
  } else {
    node.removeAttribute("aria-hidden");
  }
}

function renderMedicamentos() {
  if (!state.activeId) return;
  const ficha = FichasStore.get(state.activeId);
  const sinEntrevista = esSinEntrevista(ficha?.tipoAtencion || "");

  toggleMedSub("#med-extra", !sinEntrevista);
  toggleMedSub("#med-automed", !sinEntrevista);
  toggleMedSub("#med-plantas", !sinEntrevista);

  renderRecetas("apsRecetas", "#aps-recetas");
  renderRecetas("secRecetas", "#sec-recetas");

  if (!sinEntrevista) {
    renderExtra();
    renderAutomed();
    renderPlantas();
  }
  renderErrorTemplates();
}

function renderRecetas(kind, selector) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = "";
  const ficha = FichasStore.get(state.activeId);
  const recetas = ficha?.meds?.[kind] || [];
  if (!recetas.length) {
    host.innerHTML = '<div class="muted-card">— sin recetas —</div>';
    return;
  }
  recetas.forEach((rec) => {
    const tpl = document.getElementById("recipe-tpl");
    if (!tpl) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
        const kindClassMap = {
      apsRecetas: "recipe-card-aps",
      secRecetas: "recipe-card-sec"
    };
    const kindClass = kindClassMap[kind];
    if (kindClass) node.classList.add(kindClass);
    const fecha = node.querySelector(".rec-fecha");
    const meses = node.querySelector(".rec-meses");
    const del = node.querySelector(".rec-del");
    const originPill = node.querySelector(".rec-origin-pill");
    const segBox = node.querySelector(".seg-box");
    const list = node.querySelector(".seg-list");
    if (fecha) {
      fecha.value = rec.fechaISO || new Date().toISOString().slice(0, 10);
      fecha.addEventListener("change", () => {
        FichasStore.update(state.activeId, (f) => {
          const r = findRec(f, kind, rec.id);
          if (r) r.fechaISO = fecha.value;
        });
      });
    }
    if (meses) {
      meses.value = rec.meses || 3;
      meses.addEventListener("input", () => {
        FichasStore.update(state.activeId, (f) => {
          const r = findRec(f, kind, rec.id);
          if (r) r.meses = Math.max(1, parseInt(meses.value || "1", 10));
        });
      });
    }
        if (originPill) {
      const label = kind === "secRecetas" ? rec.origenLabel || rec.origenEstablecimiento : null;
      if (label) {
        originPill.textContent = label;
        originPill.style.display = "inline-flex";
      } else {
        originPill.style.display = "none";
        originPill.textContent = "";
      }
    }
    if (del) {
      del.addEventListener("click", () => {
        if (!confirm("¿Eliminar receta completa?")) return;
        FichasStore.update(state.activeId, (f) => {
          f.meds = f.meds || {};
          f.meds[kind] = (f.meds[kind] || []).filter((x) => x.id !== rec.id);
        });
        renderLista();
        renderMedicamentos();
        computePRM();
        renderConciliacion();
      });
    }
    if (segBox) mountSearchControls(segBox, kind, rec.id, list);
    if (list) drawMedsList(kind, rec.id, list);
    host.appendChild(node);
  });
}

function findRec(ficha, kind, recId) {
  return (ficha?.meds?.[kind] || []).find((r) => r.id === recId) || null;
}

function mountSearchControls(container, kind, recId, listNode) {
  container.innerHTML = "";
  const searchTpl = document.getElementById("searchbox-tpl");
  const controlsTpl = document.getElementById("sku-controls-tpl");
  if (!searchTpl || !controlsTpl) return;
  const search = searchTpl.content.firstElementChild.cloneNode(true);
  const controls = controlsTpl.content.firstElementChild.cloneNode(true);
  container.appendChild(search);
  container.appendChild(controls);

  const input = container.querySelector(".seg-search");
  const sugg = container.querySelector(".seg-sugg");
  const qty = container.querySelector(".seg-qty");
  const pos = container.querySelector(".seg-pos");
  const add = container.querySelector(".seg-add");
  let picked = null;
  let lastResults = [];

  const closeSuggestions = () => {
    if (!sugg) return;
    sugg.querySelectorAll(".picked").forEach((n) => n.classList.remove("picked"));
    sugg.style.display = "none";
    sugg.innerHTML = "";
  };

  const pickSku = (sku) => {
    if (!sku) return;
    picked = sku;
    renderQtyUI(picked, qty);
    add.disabled = !picked;
    if (input && sku?.nombre) {
      input.value = sku.nombre;
    }
    closeSuggestions();
    pos?.focus();
  };

  input?.addEventListener("input", () => {
    const raw = (input.value || "").trim();
    const q = raw.toUpperCase();
    if (!raw || raw.length < 2) {
      closeSuggestions();
      picked = null;
      add.disabled = true;
       lastResults = [];
      return;
    }
    const basePool = state.medsDB?.skus || [];
    let pool = basePool;
    if (kind === "apsRecetas") {
      pool = basePool.filter((s) => s.programas?.aps);
    } else if (kind === "secRecetas") {
      pool = basePool.filter((s) => s.programas?.secundario);
    }
    const items = (pool || []).filter((s) => s.nombre.includes(q)).slice(0, 60);
    lastResults = items;
    sugg.style.display = "block";
    sugg.innerHTML = items.length
      ? items.map((s) => `<div data-sku="${s.skuId}">${escapeHtml(s.nombre)}</div>`).join("")
      : '<div class="muted">Sin resultados en base de datos</div>';
    sugg.querySelectorAll("[data-sku]").forEach((opt) => {
      opt.addEventListener("click", () => {
        sugg.querySelectorAll("div").forEach((n) => n.classList.remove("picked"));
        opt.classList.add("picked");
        pickSku(state.medsDB?.skuById?.[opt.dataset.sku] || null);
      });
    });
  });

  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !picked && lastResults[0]) {
      ev.preventDefault();
      pickSku(lastResults[0]);
    }
  });

  add?.addEventListener("click", () => {
    if (!state.activeId || !picked) return;
    if (isDupInRecipe(kind, recId, picked.base)) {
      alert("Ese fármaco ya está en esta receta.");
      return;
    }
    const payload = buildMedPayload(picked, qty, pos);
    FichasStore.update(state.activeId, (f) => {
      const r = findRec(f, kind, recId);
      if (r) r.meds.push(payload);
    });
    renderLista();
    input.value = "";
    lastResults = [];
    picked = null;
    add.disabled = true;
    closeSuggestions();
    drawMedsList(kind, recId, listNode);
    computePRM();
    renderConciliacion();
  });
}

function renderQtyUI(sku, qtyNode) {
  if (!qtyNode) return;
  qtyNode.innerHTML = "";
  if (!sku) return;
  const forma = (sku.forma || "").toLowerCase();
  const id = "q" + Math.random().toString(36).slice(2, 7);
  if (forma === "comprimido" || forma === "capsula") {
    qtyNode.innerHTML = `
      <label>Cantidad: <input id="${id}-cant" type="number" min="1" step="1" value="1" style="width:80px"></label>
      <span class="pill">COMPRIMIDO(S)</span>
    `;
  } else if (forma === "suspension") {
    qtyNode.innerHTML = `
      <label>Volumen: <input id="${id}-ml" type="number" min="1" step="1" value="5" style="width:80px"></label>
      <span class="pill">ML</span>
    `;
  } else if (forma === "inhalador") {
    qtyNode.innerHTML = `
      <label>Disparos: <input id="${id}-puff" type="number" min="1" step="1" value="2" style="width:80px"></label>
      <span class="pill">PUFF</span>
    `;
  } else if (forma === "insulina") {
    qtyNode.innerHTML = `
      <label>AM: <input id="${id}-am" type="number" min="0" step="1" value="0" style="width:80px"></label>
      <label>PM: <input id="${id}-pm" type="number" min="0" step="1" value="0" style="width:80px"></label>
      <span class="pill">UI</span>
    `;
  } else {
    qtyNode.innerHTML = `
      <label>Cantidad: <input id="${id}-cant" type="number" min="1" step="1" value="1" style="width:80px"></label>
      <span class="pill">UNIDAD</span>
    `;
  }
  qtyNode.dataset.qtyId = id;
}

function buildMedPayload(picked, qtyNode, posNode) {
  const forma = picked.forma || "";
  const id = qtyNode?.dataset?.qtyId || "";
  const basePayload = {
    id: uuid(),
    sku: picked.skuId,
    base: picked.base?.toUpperCase(),
    nombre: picked.nombre,
    presentacion: picked.presentacion,
    forma,
    posologia: (posNode?.value || "").toUpperCase(),
    flags: { ...(picked.flags || {}) },
  };
  if (forma === "insulina") {
    return {
      ...basePayload,
      uiAm: document.getElementById(`${id}-am`)?.value || "0",
      uiPm: document.getElementById(`${id}-pm`)?.value || "0",
      unidad: "UI",
    };
  }
  if (forma === "suspension") {
    return {
      ...basePayload,
      cantidad: document.getElementById(`${id}-ml`)?.value || "5",
      unidad: "ML",
    };
  }
  if (forma === "inhalador") {
    return {
      ...basePayload,
      cantidad: document.getElementById(`${id}-puff`)?.value || "2",
      unidad: "PUFF",
    };
  }
  return {
    ...basePayload,
    cantidad: document.getElementById(`${id}-cant`)?.value || "1",
    unidad: forma === "capsula" ? "CAPSULA(S)" : "COMPRIMIDO(S)",
  };
}

function isDupInRecipe(kind, recId, base) {
  if (!base) return false;
  const needle = (base || "").toUpperCase();
  const ficha = FichasStore.get(state.activeId);
  const receta = findRec(ficha, kind, recId);
  if (!receta) return false;
  return receta.meds.some((m) => (m.base || "").toUpperCase() === needle);
}

function isDupSimple(key, base) {
  if (!state.activeId || !base) return false;
  const ficha = FichasStore.get(state.activeId);
  const arr = ficha?.meds?.[key] || [];
  const needle = (base || "").toUpperCase();
  return arr.some((m) => (m.base || "").toUpperCase() === needle);
}

function drawMedsList(kind, recId, listNode) {
  if (!listNode) return;
  const ficha = FichasStore.get(state.activeId);
  const receta = findRec(ficha, kind, recId);
  if (!receta || !receta.meds.length) {
    listNode.innerHTML = '<li class="muted-card">— sin medicamentos —</li>';
    return;
  }
  listNode.innerHTML = receta.meds
    .map((x, i) => liMed(x, kind, recId, i))
    .join("");
  bindListButtons(listNode, kind, recId);
}

function liMed(item, kind, recId, idx) {
  const nombreUpper = (item.nombre || "").toUpperCase();
  const yaPos = /\b(CADA|SOS)\b/.test(nombreUpper);
  let cantidad = "";
  if (!yaPos) {
    if ((item.forma || "").toLowerCase() === "insulina") {
      cantidad = ` ${item.uiAm || 0} UI AM - ${item.uiPm || 0} UI PM`;
    } else if (item.cantidad) {
      cantidad = ` ${item.cantidad} ${item.unidad || ""}`;
    }
  }
  const posTxt = !yaPos && item.posologia ? ` ${item.posologia}` : "";
  return `
    <li class="row" style="justify-content:space-between;gap:12px;align-items:flex-start">
      <div><strong>${item.nombre}</strong>${cantidad}${posTxt}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn mini warn" data-del="${kind}:${recId}:${idx}">Quitar</button>
      </div>
    </li>`;
}

function bindListButtons(node, kind, recId) {
  node.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.del.split(":")[2], 10);
      FichasStore.update(state.activeId, (f) => {
        const r = findRec(f, kind, recId);
        if (!r) return;
        r.meds.splice(idx, 1);
      });
      renderLista();
      drawMedsList(kind, recId, node);
      computePRM();
      renderConciliacion();
    });
  });
}

function renderExtra() {
  const host = $("#extra-box");
  if (!host) return;
  host.innerHTML = "";
  mountStandaloneSearch(host, "extra");
  host.drawList?.();
}

function mountStandaloneSearch(host, key) {
  const searchTpl = document.getElementById("searchbox-tpl");
  const controlsTpl = document.getElementById("sku-controls-tpl");
  if (!searchTpl || !controlsTpl) return;
  const search = searchTpl.content.firstElementChild.cloneNode(true);
  const controls = controlsTpl.content.firstElementChild.cloneNode(true);
  host.appendChild(search);
  host.appendChild(controls);
  const input = host.querySelector(".seg-search");
  const sugg = host.querySelector(".seg-sugg");
  const qty = host.querySelector(".seg-qty");
  const pos = host.querySelector(".seg-pos");
  const add = host.querySelector(".seg-add");
  let picked = null;

  input?.addEventListener("input", () => {
    const q = (input.value || "").trim().toUpperCase();
    if (!q || q.length < 2) {
      sugg.style.display = "none";
      sugg.innerHTML = "";
      picked = null;
      add.disabled = true;
      return;
    }
    const items = (state.medsDB?.skus || []).filter((s) => s.nombre.includes(q)).slice(0, 60);
    sugg.style.display = "block";
    sugg.innerHTML = items.length
      ? items.map((s) => `<div data-sku="${s.skuId}">${s.nombre}</div>`).join("")
      : '<div class="muted">Sin resultados</div>';
    sugg.querySelectorAll("[data-sku]").forEach((opt) => {
      opt.addEventListener("click", () => {
        sugg.querySelectorAll("div").forEach((n) => n.classList.remove("picked"));
        opt.classList.add("picked");
        const sku = state.medsDB?.skuById?.[opt.dataset.sku] || null;
        picked = sku;
        renderQtyUI(picked, qty);
        add.disabled = !picked;
                if (input && sku?.nombre) {
          input.value = sku.nombre;
        }
        if (sugg) {
          sugg.style.display = "none";
          sugg.innerHTML = "";
        }
      });
    });
  });

  add?.addEventListener("click", () => {
    if (!state.activeId || !picked) return;
    if (isDupSimple(key, picked.base)) {
      alert("Ese fármaco ya está registrado en este nivel.");
      return;
    }
    const payload = buildMedPayload(picked, qty, pos);
    FichasStore.update(state.activeId, (f) => {
      f.meds = f.meds || {};
      f.meds[key] = f.meds[key] || [];
      f.meds[key].push(payload);
    });
    renderLista();
    input.value = "";
    sugg.innerHTML = "";
    sugg.style.display = "none";
    picked = null;
    add.disabled = true;
    host.drawList?.();
    computePRM();
    renderConciliacion();
  });

  host.drawList = () => {
    const ficha = FichasStore.get(state.activeId);
    const arr = ficha?.meds?.[key] || [];
    const list = host.querySelector(".list");
    if (list) list.remove();
    const ul = document.createElement("ul");
    ul.className = "list";
    ul.style.marginTop = "8px";
    ul.innerHTML = arr.length ? arr.map((m, i) => liMed(m, key, null, i)).join("") : '<li class="muted-card">— vacío —</li>';
    host.appendChild(ul);
    bindStandaloneButtons(ul, key);
  };
}

function bindStandaloneButtons(listNode, key) {
  listNode.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.del.split(":")[2], 10);
      FichasStore.update(state.activeId, (f) => {
        f.meds = f.meds || {};
        f.meds[key] = f.meds[key] || [];
        f.meds[key].splice(idx, 1);
      });
      renderLista();
      listNode.remove();
      document.querySelector(`#${key === "extra" ? "extra-box" : key === "automed" ? "auto-box" : "pl-box"}`).drawList?.();
      computePRM();
      renderConciliacion();
    });
  });
}

function renderAutomed() {
  const add = $("#auto-add");
  const line = $("#auto-line");
  const list = $("#auto-list");
  if (add && line) {
    add.onclick = () => {
      if (!state.activeId) {
        alert("Abre una ficha primero.");
        return;
      }
      const texto = (line.value || "").trim();
      if (!texto) return;
      const upper = texto.toUpperCase();
      const base = (upper.split(/\s+/)[0] || "").toUpperCase();
      FichasStore.update(state.activeId, (f) => {
        f.meds = f.meds || {};
        f.meds.automed = f.meds.automed || [];
        f.meds.automed.push({ id: uuid(), texto: upper, nombre: upper, base, fecha: Date.now() });
      });
      renderLista();
      line.value = "";
      renderAutomed();
      computePRM();
      renderConciliacion();
    };
  }
  if (!list) return;
  const ficha = FichasStore.get(state.activeId);
  const arr = ficha?.meds?.automed || [];
  if (!arr.length) {
    list.innerHTML = '<li class="muted-card">— sin registros —</li>';
    return;
  }
  list.innerHTML = arr
    .map(
      (x, i) => `
        <li class="row" style="justify-content:space-between;gap:12px;align-items:center">
          <span>${x.texto}</span>
          <button class="btn mini warn" data-remove-auto="${i}">Quitar</button>
        </li>`
    )
    .join("");
  list.querySelectorAll("[data-remove-auto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removeAuto, 10);
      FichasStore.update(state.activeId, (f) => {
        f.meds.automed.splice(idx, 1);
      });
      renderLista();
      renderAutomed();
      computePRM();
      renderConciliacion();
    });
  });
}

function renderPlantas() {
  const add = $("#pl-add");
  const sel = $("#pl-sel");
  const list = $("#pl-list");
  if (add && sel) {
    add.onclick = () => {
      if (!state.activeId) {
        alert("Abre una ficha primero.");
        return;
      }
      const id = sel.value;
      const planta = state.plantas?.[id];
      if (!planta) return;
      FichasStore.update(state.activeId, (f) => {
        f.meds = f.meds || {};
        f.meds.plantas = f.meds.plantas || [];
        f.meds.plantas.push({ id, nombre: planta.nombre });
      });
      renderLista();
      renderPlantas();
    };
  }
  if (!list) return;
  const ficha = FichasStore.get(state.activeId);
  const arr = ficha?.meds?.plantas || [];
  if (!arr.length) {
    list.innerHTML = '<li class="muted-card">— sin registros —</li>';
    return;
  }
  list.innerHTML = arr
    .map(
      (x, i) => `
        <li class="row" style="justify-content:space-between;gap:12px;align-items:center">
          <span>${x.nombre}</span>
          <button class="btn mini warn" data-remove-pl="${i}">Quitar</button>
        </li>`
    )
    .join("");
  list.querySelectorAll("[data-remove-pl]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.removePl, 10);
      FichasStore.update(state.activeId, (f) => {
        f.meds.plantas.splice(idx, 1);
      });
      renderLista();
      renderPlantas();
    });
  });
}

/* ======= EA ======= */
function renderEA() {
  const out = $("#ea-out");
  if (!out) return;
  out.innerHTML = "";
  if (!state.activeId) {
    out.innerHTML = '<div class="muted">— sin datos —</div>';
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const arr = ficha?.eventosAdversos || [];
  if (!arr.length) {
    out.innerHTML = '<div class="muted">— sin eventos registrados —</div>';
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "list";
  ul.innerHTML = arr
    .slice()
    .reverse()
    .map((x) => `<li><strong>${x.medNombre}</strong><div class="muted">${x.efecto} · ${fmt(x.fecha)}</div></li>`)
    .join("");
  out.appendChild(ul);
}

/* ======= IMPORTACIÓN SSASUR ======= */
$("#btn-import-ssasur")?.addEventListener("click", () => {
  const modal = $("#import-ssasur-modal");
  if (modal) modal.style.display = "flex";
});
$("#ssasur-cancel")?.addEventListener("click", () => {
  const modal = $("#import-ssasur-modal");
  if (modal) modal.style.display = "none";
  const area = $("#ssasur-input");
  if (area) area.value = "";
});
$("#ssasur-process")?.addEventListener("click", () => {
  if (!state.activeId) {
    alert("Abre una ficha primero.");
    return;
  }
  const area = $("#ssasur-input");
  const txt = area ? area.value.trim() : "";
  if (!txt) {
    alert("Pega el texto de SSASUR para procesar.");
    return;
  }
  if (!state.medsDB?.skus?.length) {
    alert("La base de medicamentos no está disponible.");
    return;
  }
  const ok = importarSSASUR(txt);
  if (!ok) return;
  const modal = $("#import-ssasur-modal");
  if (modal) modal.style.display = "none";
  if (area) area.value = "";
});

/* ======= IMPORTACIÓN RAYEN ======= */
$("#btn-import-rayen")?.addEventListener("click", () => {
  const modal = $("#import-rayen-modal");
  if (modal) modal.style.display = "flex";
});
$("#rayen-cancel")?.addEventListener("click", () => {
  const modal = $("#import-rayen-modal");
  if (modal) modal.style.display = "none";
  const area = $("#rayen-input");
  if (area) area.value = "";
});
$("#rayen-process")?.addEventListener("click", () => {
  if (!state.activeId) {
    alert("Abre una ficha primero.");
    return;
  }
  const txt = $("#rayen-input")?.value.trim();
  if (!txt) {
    alert("Pega el texto de Rayen para procesar.");
    return;
  }
  if (!state.medsDB?.skus?.length) {
    alert("La base de medicamentos no está disponible.");
    return;
  }
  importarRayen(txt);
  const modal = $("#import-rayen-modal");
  if (modal) modal.style.display = "none";
  $("#rayen-input").value = "";
});

function importarSSASUR(raw) {
  const receta = parseSSASUR(raw);
  if (!receta || !receta.meds.length) {
    alert("No se encontraron medicamentos válidos en el texto pegado.");
    return false;
  }
  FichasStore.update(state.activeId, (f) => {
    f.meds = f.meds || {};
    f.meds.secRecetas = f.meds.secRecetas || [];
    f.meds.secRecetas.push(receta);
  });
  renderLista();
  renderMedicamentos();
  computePRM();
  renderConciliacion();
  return true;
}

function importarRayen(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return;
  let startIdx = 0;
  let fechaISO = new Date().toISOString().slice(0, 10);
  const matchFecha = lines[0].match(/(\d{2})-(\d{2})-(\d{4})/);
  if (matchFecha) {
    const [_, dd, mm, yyyy] = matchFecha;
    fechaISO = `${yyyy}-${mm}-${dd}`;
    startIdx = 1;
  }
  const receta = { id: uuid(), fechaISO, meds: [] };
  let recetaDuracion = null;
  for (let i = startIdx; i < lines.length; i++) {
    const row = lines[i];
    const m = row.match(/^\(\d+\)\s+(.+?):\s+(.+)$/);
    if (!m) continue;
    const nombre = normalizarNombre(m[1]);
    const posoRaw = m[2];
    const detalle = parseRayenPosologia(posoRaw);
    const candidatos = findRayenCandidates(nombre);
    const picked = pickBestSku(candidatos, nombre, detalle);
    if (!picked) continue;
    if (typeof detalle.duracionMeses === "number" && !Number.isNaN(detalle.duracionMeses)) {
      recetaDuracion =
        recetaDuracion === null
          ? detalle.duracionMeses
          : Math.max(recetaDuracion, detalle.duracionMeses);
    }
    const payload = buildPayloadFromImport(picked, detalle);
    const ajustado = aplicarExcepcionCelecoxib(payload, detalle);
    receta.meds.push(ajustado);
  }
  if (!receta.meds.length) return;
  if (recetaDuracion !== null) {
    const meses = Math.max(1, Math.round(recetaDuracion));
    receta.meses = meses;
  }
  FichasStore.update(state.activeId, (f) => {
    f.meds = f.meds || {};
    f.meds.apsRecetas = f.meds.apsRecetas || [];
    f.meds.apsRecetas.push(receta);
  });
  renderLista();
  renderMedicamentos();
  computePRM();
  renderConciliacion();
}

function parseSSASUR(raw) {
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  let fechaISO = new Date().toISOString().slice(0, 10);
  const fechaMatch = raw.match(/Fecha\s+Digitaci[óo]n\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (fechaMatch) {
    const [, dd, mm, yyyy] = fechaMatch;
    fechaISO = `${yyyy}-${mm}-${dd}`;
  }

  let mesesHeader = null;
  const mesesMatch = raw.match(/Tipo\s+Atenci[óo]n[^\n]*\((\d+)(?:\s*\/\s*(\d+))?\)/i);
  if (mesesMatch) {
    const rawValor = mesesMatch[2] || mesesMatch[1];
    const parsed = parseInt(rawValor, 10);
    if (!Number.isNaN(parsed) && parsed > 0) mesesHeader = parsed;
  }

  const entries = [];
  let inPaciente = false;
  let inPrescripcion = false;
  let current = null;

  for (const lineRaw of lines) {
    const upper = lineRaw.toUpperCase();
    if (/^PACIENTE\b/.test(upper)) {
      inPaciente = true;
      continue;
    }
    if (inPaciente) {
      if (/^PRESCRIPCI[ÓO]N\b/.test(upper)) {
        inPaciente = false;
        inPrescripcion = true;
      }
      continue;
    }
    if (!inPrescripcion) {
      if (/^PRESCRIPCI[ÓO]N\b/.test(upper)) {
        inPrescripcion = true;
      }
      continue;
    }
    if (/^PRODUCTO\b/i.test(lineRaw) || /^CANTIDAD\b/i.test(lineRaw)) continue;
    if (/^\d+\.-/.test(lineRaw)) {
      if (current) entries.push(current);
      const producto = lineRaw.replace(/^\d+\.-\s*/, "").trim();
      current = { producto, poso: [] };
    } else if (current) {
      current.poso.push(lineRaw);
    }
  }
  if (current) entries.push(current);

  const receta = { id: uuid(), fechaISO, meds: [] };
  const origenLabel = buildSSASUREstablecimientoLabel(raw);
  if (origenLabel) receta.origenLabel = origenLabel;
  let recetaDuracion = null;

  entries.forEach((entry) => {
    const nombreLimpio = limpiarNombreSSASUR(entry.producto);
    const nombreNormalizado = normalizarNombre(nombreLimpio);
    if (!nombreNormalizado) return;
    const posoRaw = (entry.poso || []).join(" ").replace(/\s+/g, " ").trim();
    const detalle = parseSSASURPosologia(posoRaw);
    const candidatos = findSSASURCandidates(nombreNormalizado);
    const picked = pickBestSku(candidatos, nombreNormalizado, detalle);
    if (!picked) return;
    if (typeof detalle.duracionMeses === "number" && !Number.isNaN(detalle.duracionMeses)) {
      recetaDuracion =
        recetaDuracion === null
          ? detalle.duracionMeses
          : Math.max(recetaDuracion, detalle.duracionMeses);
    }
    const payload = buildPayloadFromImport(picked, detalle);
    payload.posologia = (payload.posologia || "").replace(/\s+/g, " ").trim();
    if (!payload.posologia) payload.posologia = "SEGÚN INDICACIÓN";
    receta.meds.push(payload);
  });

  if (!receta.meds.length) return null;
  if (mesesHeader !== null) {
    receta.meses = Math.max(1, mesesHeader);
  } else if (recetaDuracion !== null) {
    receta.meses = Math.max(1, Math.round(recetaDuracion));
  }
  return receta;
}

function buildSSASUREstablecimientoLabel(raw = "") {
  if (!raw) return null;
  const match = raw.match(/Establecimiento\s+([^\n]+)/i);
  if (!match) return null;
  let value = (match[1] || "").replace(/^[:\-\s]+/, "").trim();
  if (!value) return null;
  value = value.replace(/\s+/g, " ").trim();
  const upper = value.toUpperCase();
  if (upper.includes("CAPLC")) {
    return "Establecimiento COMPLEJO ASISTENCIAL PADRE LAS CASAS";
  }
  if (upper.includes("IMPERIAL HOSP")) {
    return "Establecimiento IMPERIAL HOSP.";
  }
  if (upper.includes("TEMUCO HOSP")) {
    return "Establecimiento TEMUCO HOSP.";
  }
  return `Establecimiento ${value}`.replace(/\s+/g, " ").trim();
}

function limpiarNombreSSASUR(producto = "") {
  let out = (producto || "").replace(/\s+/g, " ").trim();
  out = out.replace(/\s+\d+$/, "").trim();
  out = out.replace(/[,.;:]+$/, "").trim();
  return out;
}

function parseSSASURPosologia(raw = "") {
  const texto = raw || "";
  const obsMatch = texto.match(/OBSERVACI[ÓO]N:\s*(.+)$/i);
  const observacion = obsMatch ? obsMatch[1].trim() : null;
  let base = texto.replace(/OBSERVACI[ÓO]N:\s*.+$/i, "").replace(/,\s*$/, "").trim();
  const detalle = parseRayenPosologia(base);
  let posologia = (detalle.posologia || "").replace(/\bVIA\s+[A-ZÁÉÍÓÚÑ ]+\b/gi, "");
  posologia = posologia.replace(/\s+/g, " ").trim();
  if (!posologia && observacion) {
    const obsUpper = observacion
      .toUpperCase()
      .replace(/SEG[UÚ]N/g, "SEGÚN")
      .replace(/INDICACION/g, "INDICACIÓN");
    posologia = obsUpper.replace(/[,.;:]+$/, "").trim();
  }
  if (!posologia && /SEG[UÚ]N/i.test(texto)) {
    posologia = "SEGÚN INDICACIÓN";
  }
  posologia = posologia.replace(/[,.;:]+$/, "").trim();
  detalle.posologia = posologia;
  return detalle;
}

function findSSASURCandidates(nombreNormalizado) {
  const upper = normalizarNombre(nombreNormalizado || "");
  const skus = state.medsDB?.skus || [];
  const secundarios = skus.filter((sku) => sku.programas?.secundario);
  const pool = secundarios.filter((sku) => matchesNombreTokens(upper, sku));
  if (pool.length) return pool;
  return findRayenCandidates(nombreNormalizado);
}

function normalizarNombre(s = "") {
  return s
    .toUpperCase()
    .replace(/[().,:\/+\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizarNombre(s = "") {
  return normalizarNombre(s)
    .split(" ")
    .filter((tok) => tok && tok.length > 2 && !/^\d+(?:\.\d+)?$/.test(tok));
}

function buildPayloadFromImport(sku, detalle = {}) {
  const basePayload = {
    id: uuid(),
    sku: sku.skuId,
    base: sku.base?.toUpperCase(),
    nombre: sku.nombre,
    presentacion: sku.presentacion,
    forma: sku.forma,
    posologia: (detalle.posologia || "").toUpperCase(),
    flags: { ...(sku.flags || {}) },
  };
  if (sku.forma === "insulina") {
  return {
      ...basePayload,
      uiAm: detalle.uiAm || detalle.cantidad || "0",
      uiPm: detalle.uiPm || "0",
      unidad: "UI",
    };
  }
  const cantidad = detalle.cantidad || "1";
  const unidad = inferUnidadFromSku(sku.forma, detalle.unidadToken);
  return { ...basePayload, cantidad, unidad };
}

function aplicarExcepcionCelecoxib(payload, detalle = {}) {
  const baseUpper = (payload?.base || "").toUpperCase();
  if (baseUpper !== "CELECOXIB") return payload;
  const poso = (payload.posologia || "").trim();
  const medLabel = (payload.nombre || payload.base || "CELECOXIB").toUpperCase();
  if (!poso) {
    const cantidad = detalle.cantidad || payload.cantidad || "5";
    return {
      ...payload,
      cantidad,
      unidad: payload.unidad || "COMPRIMIDO(S)",
      posologia: "5 COMPRIMIDOS CADA 1 MES",
    };
  }
  const esMensual = /\bMES(ES)?\b/.test(poso) || /\b30\s*D[IÍ]AS?\b/.test(poso);
  const mencionaHoras = /HORAS?|HRS?/i.test(poso);
  if (!esMensual && mencionaHoras) {
    addMedError("Prescripción", `Frecuencia de administración incorrecta — ${medLabel} (${poso})`, medLabel);
  }
  return payload;
}

function findRayenCandidates(nombreNormalizado) {
  const upper = normalizarNombre(nombreNormalizado || "");
  const skus = state.medsDB?.skus || [];
  return skus.filter((sku) => matchesNombreTokens(upper, sku));
}

function matchesNombreTokens(upperNombre, sku) {
  if (!upperNombre) return false;
  const baseTokens = tokenizarNombre(sku.base || "");
  if (baseTokens.length && baseTokens.every((tok) => upperNombre.includes(tok))) {
    return true;
  }
  const nombreTokens = tokenizarNombre(sku.nombre || "");
  if (nombreTokens.length && nombreTokens.every((tok) => upperNombre.includes(tok))) {
    return true;
  }
  return false;
}

function pickBestSku(candidatos, nombreNormalizado, detalle) {
  if (!Array.isArray(candidatos) || !candidatos.length) return null;
  const tokens = nombreNormalizado.split(" ").filter(Boolean);
  const formaHint = detectFormaHint(nombreNormalizado);
  const strengths = extractStrengthTokens(nombreNormalizado);
  let pool = candidatos.slice();
  if (formaHint) {
    const byForma = pool.filter((sku) => sku.forma === formaHint);
    if (byForma.length) pool = byForma;
  }
  if (strengths.length) {
    const byStrength = pool.filter((sku) =>
      strengths.every((str) => presentacionMatchesStrength(sku.presentacion, str))
    );
    if (byStrength.length) pool = byStrength;
  }
  const normalizedNombre = normalizarNombre(nombreNormalizado);
  const exact = pool.find((sku) => normalizarNombre(sku.nombre || "") === normalizedNombre);
  if (exact) return exact;
  const scored = pool
    .map((sku) => ({
      sku,
      score: computeSkuScore(sku, tokens, strengths, formaHint, detalle),
    }))
    .sort((a, b) => b.score - a.score);
  return (scored[0] && scored[0].sku) || pool[0] || null;
}

function computeSkuScore(sku, tokens, strengths, formaHint, detalle) {
  let score = 0;
  const presentacion = (sku.presentacion || "").toUpperCase();
  const nombre = (sku.nombre || "").toUpperCase();
  if (formaHint && sku.forma === formaHint) score += 10;
  tokens.forEach((tok) => {
    if (tok.length < 3) return;
    if (nombre.includes(tok)) score += 2;
    if (presentacion.includes(tok)) score += 1;
  });
  strengths.forEach((str) => {
    if (presentacionMatchesStrength(presentacion, str)) score += 5;
  });
  if (detalle?.unidadToken) {
    const unidad = detalle.unidadToken;
    const baseUnidad = unidad.replace(/\(S\)/g, "").replace(/S$/, "");
    if (presentacion.includes(unidad)) score += 1;
    else if (baseUnidad && presentacion.includes(baseUnidad)) score += 1;
  }
  return score;
}

function detectFormaHint(nombreNormalizado = "") {
  if (!nombreNormalizado) return null;
  if (nombreNormalizado.includes("INHAL")) return "inhalador";
  if (nombreNormalizado.includes("INSUL")) return "insulina";
  if (nombreNormalizado.includes("SUSPENSION")) return "suspension";
  if (nombreNormalizado.includes("CAPSULA")) return "capsula";
  if (nombreNormalizado.includes("COMPRIMID")) return "comprimido";
  return null;
}

function extractStrengthTokens(nombreNormalizado = "") {
  const tokens = [];
  const regex = /(\d+(?:[.,]\d+)?)\s*(MG|MCG|UG|G|ML|UI|IU|MUI|MMOL|MEQ|%)/gi;
  let match;
  while ((match = regex.exec(nombreNormalizado))) {
    const valueRaw = match[1] || "";
    const unitRaw = match[2] || "";
    const unit = normalizeStrengthUnit(unitRaw);
    if (!unit) continue;
    const value = valueRaw.replace(/,/g, ".").replace(/^0+(\d)/, "$1");
    tokens.push({ value, unit });
  }
  return tokens;
}

function normalizeStrengthUnit(unit = "") {
  const up = unit.toUpperCase().replace(/[º°]/g, "");
  if (up === "UG") return "MCG";
  if (up === "IU") return "UI";
  return up;
}

function presentacionMatchesStrength(presentacion = "", strength) {
  if (!presentacion || !strength) return false;
  const baseUnit = strength.unit;
  const baseValue = strength.value;
  const candidates = new Set();
  const unitsToCheck = [baseUnit];
  if (baseUnit === "MCG") unitsToCheck.push("UG", "µG");
  if (baseUnit === "UI") unitsToCheck.push("IU");
  unitsToCheck.forEach((unit) => {
    const variants = [baseValue];
    if (baseValue.includes(".")) variants.push(baseValue.replace(/\./g, ","));
    if (baseValue.includes(",")) variants.push(baseValue.replace(/,/g, "."));
    variants.forEach((val) => {
      candidates.add(`${val} ${unit}`);
      candidates.add(`${val}${unit}`);
    });
  });
  return Array.from(candidates).some((c) => presentacion.includes(c));
}

function convertDurationToMonths(valueRaw, unitRaw) {
  if (valueRaw === undefined || valueRaw === null || !unitRaw) return null;
  const num = parseFloat(String(valueRaw).replace(/,/g, "."));
  if (Number.isNaN(num)) return null;
  const normalizedUnit = unitRaw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (normalizedUnit.startsWith("MES")) {
    return num;
  }
  if (normalizedUnit.startsWith("SEM")) {
    return (num * 7) / 30;
  }
  if (normalizedUnit.startsWith("DIA")) {
    return num / 30;
  }
  return null;
}

function parseRayenPosologia(posologiaRaw = "") {
  const original = posologiaRaw || "";
  let upper = original.toUpperCase();
  let durationValue = null;
  let durationText = null;
  const durationRegex =
    /(DURACI[ÓO]N[:\s-]*)?(?:POR\s+)?(\d+(?:[.,]\d+)?)\s*(MES(?:ES)?|SEMANAS?|SEM|D[IÍ]AS?)(?:\s+DE\s+TRATAMIENTO)?/gi;
  upper = upper.replace(durationRegex, (_, _label, amountRaw, unitRaw) => {
    const months = convertDurationToMonths(amountRaw, unitRaw);
    if (months !== null && !Number.isNaN(months)) {
      durationValue = months;
      const clean = trimDecimal(months);
      const plural = Math.abs(months - 1) < 1e-9 ? "" : "ES";
      durationText = `${clean} MES${plural}`;
    }
    return " ";
  });
  upper = upper.replace(/DE\s+LA\s+RECETA\b.*$/i, "");
  upper = upper.replace(/RECETA\s+N[º°\.]*\s*\d+.*$/i, "");
  upper = upper.replace(/N[º°\.]*\s*\d+/gi, "");
  upper = upper.replace(/\s+/g, " ").trim();
  let cantidad = null;
  let unidadToken = null;
  let resto = upper;
  const tokens = resto.split(" ").filter(Boolean);
  if (tokens.length) {
    const qtyToken = tokens[0];
    const parsedQty = parseCantidadToken(qtyToken);
    if (parsedQty !== null) {
      cantidad = parsedQty;
      tokens.shift();
      if (tokens.length) {
        const maybeUnidad = normalizeUnidadToken(tokens[0]);
        if (maybeUnidad) {
          unidadToken = maybeUnidad;
          tokens.shift();
        }
      }
      resto = tokens.join(" ");
    }
  }
  resto = resto
    .replace(/^[,.;:-]+/, "")
    .replace(/[,.;:-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    posologia: resto.toUpperCase(),
    cantidad,
    unidadToken,
    duracionMeses: durationValue,
    duracionTexto: durationText,
  };
}

function parseCantidadToken(token = "") {
  if (!token) return null;
  const clean = token.replace(/\s+/g, "");
  if (/^\d+\/\d+$/.test(clean)) {
    const [num, den] = clean.split("/").map((x) => parseFloat(x.replace(/,/g, ".")));
    if (!den || Number.isNaN(num) || Number.isNaN(den)) return null;
    const value = num / den;
    return trimDecimal(value);
  }
  const normalized = clean.replace(/,/g, ".");
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return trimDecimal(parseFloat(normalized));
  }
  return null;
}

function trimDecimal(value) {
  if (value === null || value === undefined) return null;
  let str = String(value);
  if (typeof value === "number") {
    str = value.toFixed(3);
  }
  str = str.replace(/0+$/, "").replace(/\.$/, "");
  return str || "0";
}

function normalizeUnidadToken(token = "") {
  if (!token) return null;
  const clean = token.replace(/[()\.]/g, "").toUpperCase();
  const map = {
    COMPRIMIDO: "COMPRIMIDO(S)",
    COMPRIMIDOS: "COMPRIMIDO(S)",
    CAPSULA: "CAPSULA(S)",
    CAPSULAS: "CAPSULA(S)",
    UNIDAD: "UNIDAD",
    UNIDADES: "UNIDAD",
    TABLETA: "TABLETA(S)",
    TABLETAS: "TABLETA(S)",
    GOTA: "GOTA(S)",
    GOTAS: "GOTA(S)",
    ML: "ML",
    CC: "ML",
    UI: "UI",
    IU: "UI",
    SOBRES: "SOBRE(S)",
    SOBRE: "SOBRE(S)",
    AMP: "AMPOLLA(S)",
    AMPOLLA: "AMPOLLA(S)",
    AMPOLLAS: "AMPOLLA(S)",
    PARCHE: "PARCHE(S)",
    PARCHES: "PARCHE(S)",
  };
  return map[clean] || null;
}

function inferUnidadFromSku(forma, unidadToken) {
  switch (forma) {
    case "insulina":
      return "UI";
    case "suspension":
      return "ML";
    case "inhalador":
      return "PUFF";
    case "capsula":
      return "CAPSULA(S)";
    case "comprimido":
      return "COMPRIMIDO(S)";
    default:
      return unidadToken || "UNIDAD";
  }
}

/* ======= PRM ======= */
function getAllMeds(ficha) {
  if (!ficha) return [];
  const meds = [];
  const pushRec = (arr = [], origen, sourceKey) => {
    (arr || []).forEach((rec) => {
      (rec.meds || []).forEach((m) => {
        meds.push({
          ...m,
          base: (m.base || "").toUpperCase(),
          nombre: m.nombre || "",
          origen,
          sourceKey,
          recetaId: rec.id,
        });
      });
    });
  };
  pushRec(ficha.meds?.apsRecetas, "APS", "apsRecetas");
  pushRec(ficha.meds?.secRecetas, "A2S", "secRecetas");
  (ficha.meds?.extra || []).forEach((m) => {
    meds.push({
      ...m,
      base: (m.base || "").toUpperCase(),
      nombre: m.nombre || "",
      origen: "Extrasistema",
      sourceKey: "extra",
    });
  });
  (ficha.meds?.automed || []).forEach((m) => {
    const texto = (m.nombre || m.texto || "").trim();
    meds.push({
      ...m,
      base: (m.base || texto.split(/\s+/)[0] || "").toUpperCase(),
      nombre: texto || m.base || "",
      origen: "Automedicación",
      sourceKey: "automed",
    });
  });
  return meds;
}

const normalizeBaseKey = (txt = "") =>
  txt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

function buildBaseDisplayMap(meds = []) {
  const map = new Map();
  meds.forEach((med) => {
    const baseKey = normalizeBaseKey(med.base || med.nombre || "");
    if (!baseKey) return;
    const etiqueta = (med.nombre || med.base || "").toUpperCase();
    if (!map.has(baseKey)) map.set(baseKey, new Set());
    map.get(baseKey).add(etiqueta);
  });
  const plainMap = new Map();
  map.forEach((value, key) => {
    plainMap.set(key, Array.from(value));
  });
  return plainMap;
}

function detectarDuplicados(meds) {
  const mapa = new Map();
  meds.forEach((med) => {
    const base = (med.base || "").toUpperCase();
    if (!base) return;
    if (!mapa.has(base)) mapa.set(base, []);
    mapa.get(base).push(med);
  });
  const duplicados = [];
  mapa.forEach((arr, base) => {
    if (arr.length < 2) return;
    const claves = new Set(arr.map((m) => `${m.sourceKey || ""}:${m.recetaId || m.id || ""}`));
    if (claves.size <= 1) return;
    const origenes = Array.from(new Set(arr.map((m) => m.origen || "Receta")));
    duplicados.push({ base, meds: arr, origenes });
  });
  return duplicados;
}

function computePRM() {
  if (!state.activeId) {
    $("#prm-auto").innerHTML = '<div class="muted">— sin ficha —</div>';
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const anteFlags = ficha?.anamnesis?.flags || {};
  const meds = getAllMeds(ficha);
  const bases = Array.from(new Set(meds.map((m) => (m.base || "").toUpperCase()).filter(Boolean)));
  const resumen = [];
  const baseDisplayMap = buildBaseDisplayMap(meds);
  let prmInteraccionesEntries = [];
  
  const duplicados = detectarDuplicados(meds);
  if (duplicados.length) {
    resumen.push({
      titulo: "Duplicidades detectadas",
      detalle:
        duplicados
          .map((dup) => {
            const origenes = dup.origenes.join(" · ");
            return `• ${dup.base}${origenes ? ` — ${origenes}` : ""}`;
          })
          .join("<br>") || "Revisar duplicidades",
    });
  }

  if (ficha.age65) {
    const ppiMeds = meds.filter((m) => m.flags?.ppi);
    if (ppiMeds.length) {
      const listado = [];
      const vistos = new Set();
      ppiMeds.forEach((m) => {
        const clave = m.base || m.nombre || "";
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        const etiqueta = (m.nombre || m.base || "").toUpperCase();
        const origen = m.origen ? ` (${m.origen})` : "";
        listado.push(`• ${etiqueta}${origen}`);
      });
      if (listado.length) {
        resumen.push({ titulo: "Alertas PPI (≥65)", detalle: listado.join("<br>") });
      }
    }
  }

    if (anteFlags.erc) {
    const renales = meds.filter((m) => m.flags?.ajusteRenal);
    if (renales.length) {
      const listado = [];
      const vistos = new Set();
      renales.forEach((m) => {
        const clave = m.base || m.nombre || "";
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        const etiqueta = (m.nombre || m.base || "").toUpperCase();
        const origen = m.origen ? ` (${m.origen})` : "";
        const detalle = m.flags?.ajusteRenalDetalle;
        const nota = detalle ? ` — ${detalle}` : " — revisar ajuste renal";
        listado.push(`• ${etiqueta}${origen}${nota}`);
      });
      if (listado.length) {
        resumen.push({ titulo: "Ajuste renal (ERC)", detalle: listado.join("<br>") });
      }
    }
  }

  if (state.interacciones) {
    const inter = evaluarInteracciones({ meds: bases, interacciones: state.interacciones });
    if (inter.length) {
            const detalles = inter
        .map((ix) => {
          const gruposDetallados = (ix.grupos || []).map((g) => {
            const medsEncontrados = (g.encontrados || []).flatMap((baseNorm) => {
              const lista = baseDisplayMap.get(baseNorm) || [];
              return lista.length ? lista : [baseNorm];
            });
            const unicos = Array.from(new Set(medsEncontrados));
            return {
              nombre: g.nombre,
              meds: unicos,
            };
          });
          const etiquetaGrupos = gruposDetallados
            .map((g) => {
              if (!g) return "";
              if (g.meds?.length) return `${g.nombre} (${g.meds.join(", ")})`;
              return g.nombre;
            })
            .filter(Boolean)
            .join(" + ");
          const comentario = ix.descripcion || ix.comentario || "Interacción detectada.";
          const texto = etiquetaGrupos ? `${etiquetaGrupos} — ${comentario}` : comentario;
          return { texto, grupos: gruposDetallados };
        })
        .sort((a, b) => a.texto.localeCompare(b.texto, "es", { sensitivity: "base" }));

      resumen.push({
        titulo: "Interacciones potenciales",
        detalle: detalles.map((d) => `• ${d.texto}`).join("<br>") || "Revisar interacciones",
      });
      
      const hoy = new Date().toISOString().slice(0, 10);
      prmInteraccionesEntries = detalles.map((d) => ({
        tipo: "Interacción medicamentosa",
        detalle: d.texto,
        fecha: hoy,
        auto: true,
        autoSource: "interaccion",
      }));
    }
  }
  
  syncAutoPRMEntries("interaccion", prmInteraccionesEntries);
  const out = $("#prm-auto");
  if (!out) return;
  if (!resumen.length) {
    out.innerHTML = '<div class="muted">— sin hallazgos automáticos —</div>';
    return;
  }
  out.innerHTML = resumen
    .map(
      (item) => `
        <div class="muted-card">
          <strong>${item.titulo}</strong>
          <div style="margin-top:6px">${item.detalle}</div>
        </div>`
    )
    .join("");
}

function syncAutoPRMEntries(source, entries = []) {
  if (!state.activeId) return;
  const safeEntries = Array.isArray(entries) ? entries : [];
  FichasStore.update(state.activeId, (f) => {
    const actuales = Array.isArray(f.prm) ? f.prm : [];
    const restantes = actuales.filter((item) => item?.autoSource !== source);
    const siguiente = [...restantes, ...safeEntries];
    const iguales = JSON.stringify(actuales) === JSON.stringify(siguiente);
    if (!iguales) {
      f.prm = siguiente;
    }
  });
}

/* ======= BOTONES AGREGAR RECETAS ======= */
$("#aps-add-rec")?.addEventListener("click", () => {
  if (!state.activeId) {
    alert("Abre una ficha primero.");
    return;
  }
  FichasStore.update(state.activeId, (f) => {
    f.meds = f.meds || {};
    f.meds.apsRecetas = f.meds.apsRecetas || [];
    f.meds.apsRecetas.push({ id: uuid(), fechaISO: new Date().toISOString().slice(0, 10), meses: 3, meds: [] });
  });
  renderMedicamentos();
});

$("#sec-add-rec")?.addEventListener("click", () => {
  if (!state.activeId) {
    alert("Abre una ficha primero.");
    return;
  }
  FichasStore.update(state.activeId, (f) => {
    f.meds = f.meds || {};
    f.meds.secRecetas = f.meds.secRecetas || [];
    f.meds.secRecetas.push({ id: uuid(), fechaISO: new Date().toISOString().slice(0, 10), meses: 3, meds: [] });
  });
  renderMedicamentos();
});
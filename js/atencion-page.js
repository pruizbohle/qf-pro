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
  "DLP",
  "HIPOT4",
  "ERC",
  "POLIARTROSIS",
  "OB",
  "TR SUEÑO",
  "TR DEPRESIVO",
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
}

function renderAntecedentes() {
  const host = $("#ant-list");
  if (!host) return;
  const antIam = $("#ant-iamacv");
  const antErc = $("#ant-erc");
  const antEmb = $("#ant-embarazo");
  host.innerHTML = "";
    if (!state.activeId) {
    if (antIam) antIam.checked = false;
    if (antErc) antErc.checked = false;
    if (antEmb) antEmb.checked = false;
    return;
  }
  const ficha = FichasStore.get(state.activeId);
  const flags = ficha?.anamnesis?.flags || {};
  if (antIam) antIam.checked = !!flags.antIAMACV;
  if (antErc) antErc.checked = !!flags.erc;
  if (antEmb) antEmb.checked = !!flags.embarazo;
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

function setupErrores() {
  $("#err-add")?.addEventListener("click", () => {
    if (!state.activeId) {
      alert("Abre una ficha primero.");
      return;
    }
    const etapa = $("#err-etapa")?.value.trim();
    const desc = $("#err-desc")?.value.trim();
    if (!etapa || !desc) {
      alert("Completa etapa y descripción.");
      return;
    }
    FichasStore.update(state.activeId, (f) => {
      f.meds = f.meds || {};
      f.meds.errores = f.meds.errores || [];
      f.meds.errores.push({ etapa, desc, ts: Date.now() });
    });
    renderLista();
    $("#err-desc").value = "";
    renderErrores();
  });
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
  arr.slice().reverse().forEach((err) => {
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${err.etapa}</strong></div><div class="muted">${err.desc}</div>`;
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
    if (input && typeof input.blur === "function") {
      input.blur();
    }
  };

  const pickSku = (sku) => {
    if (!sku) return;
    picked = sku;
    renderQtyUI(picked, qty);
    add.disabled = !picked;
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
      <div>
        <div><strong>${item.nombre}</strong>${cantidad}${posTxt}</div>
        <div class="muted" style="font-size:12px;">${item.presentacion || ""}</div>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn mini" data-ea="${kind}:${recId}:${idx}">EA</button>
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
  node.querySelectorAll("[data-ea]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parts = btn.dataset.ea.split(":");
      const idx = parseInt(parts[2], 10);
      const ficha = FichasStore.get(state.activeId);
      const r = findRec(ficha, kind, recId);
      const med = r?.meds?.[idx];
      if (!med) return;
      const efecto = prompt(`Describe la reacción adversa para ${med.nombre}`);
      if (!efecto) return;
      FichasStore.update(state.activeId, (f) => {
        f.eventosAdversos = f.eventosAdversos || [];
        f.eventosAdversos.push({
          medSku: med.sku,
          base: med.base,
          medNombre: med.nombre,
          efecto,
          fecha: Date.now(),
        });
      });
      renderEA();
      showTab("ea");
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
        picked = state.medsDB?.skuById?.[opt.dataset.sku] || null;
        renderQtyUI(picked, qty);
        add.disabled = !picked;
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
  listNode.querySelectorAll("[data-ea]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.ea.split(":")[2], 10);
      const ficha = FichasStore.get(state.activeId);
      const arr = ficha?.meds?.[key] || [];
      const med = arr[idx];
      if (!med) return;
      const efecto = prompt(`Describe la reacción adversa para ${med.nombre}`);
      if (!efecto) return;
      FichasStore.update(state.activeId, (f) => {
        f.eventosAdversos = f.eventosAdversos || [];
        f.eventosAdversos.push({ medSku: med.sku, base: med.base, medNombre: med.nombre, efecto, fecha: Date.now() });
      });
      renderEA();
      showTab("ea");
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
  const receta = { id: uuid(), fechaISO, meses: 12, meds: [] };
  for (let i = startIdx; i < lines.length; i++) {
    const row = lines[i];
    const m = row.match(/^\(\d+\)\s+(.+?):\s+(.+)$/);
    if (!m) continue;
    const nombre = normalizarNombre(m[1]);
    const posoRaw = m[2];
    const candidatos = (state.medsDB?.skus || []).filter((sku) => nombre.includes(sku.base.toUpperCase()));
    const picked = candidatos[0];
    if (!picked) continue;
    const payload = buildPayloadFromImport(picked, posoRaw);
    receta.meds.push(payload);
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

function normalizarNombre(s = "") {
  return s
    .toUpperCase()
    .replace(/[().,:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPayloadFromImport(sku, posologia) {
  const basePayload = {
    id: uuid(),
    sku: sku.skuId,
    base: sku.base?.toUpperCase(),
    nombre: sku.nombre,
    presentacion: sku.presentacion,
    forma: sku.forma,
    posologia: (posologia || "").toUpperCase(),
    flags: { ...(sku.flags || {}) },
  };
  const cantidadMatch = posologia.match(/(\d+)/);
  const cantidad = cantidadMatch ? cantidadMatch[1] : "1";
  if (sku.forma === "insulina") {
    return { ...basePayload, uiAm: cantidad, uiPm: "0", unidad: "UI" };
  }
  return { ...basePayload, cantidad, unidad: "UNIDAD" };
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

  if (ficha.age65 && state.criterios) {
    const criterios = evaluarCriterios({ perfil: { edad: 70 }, meds: bases, criterios: state.criterios });
    if (criterios.length) {
      resumen.push({
        titulo: "Criterios clínicos",
        detalle: criterios.map((c) => `• ${c.nombre || c.descripcion || "Criterio"}`).join("<br>") || "Revisar criterios",
      });
    }
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
      resumen.push({
        titulo: "Interacciones potenciales",
        detalle: inter.map((i) => `• ${i.descripcion || `${i.a} + ${i.b}`}`).join("<br>") || "Revisar interacciones",
      });
    }
  }
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
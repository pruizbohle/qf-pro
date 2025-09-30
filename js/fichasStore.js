// js/fichasStore.js
const KEY = "qfpro_fichas_v3";          // namespace
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 días
const MAX = 5;

const now = () => Date.now();
const load = () => { 
  try { 
    return JSON.parse(localStorage.getItem(KEY)) || { fichas: [] }; 
  } catch { 
    return { fichas: [] }; 
  } 
};
const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));

function cleanup(state){
  const t = now();
  state.fichas = (state.fichas||[]).filter(f => (t - f.createdAt) < TTL_MS);
  save(state);
  return state;
}
function onlyINI(ini){ return /^[A-Z]{3}$/.test(ini); }

export const FichasStore = {
  state: cleanup(load()),
  list(){ return cleanup(this.state).fichas; },
  get(id){ return (this.state.fichas||[]).find(f=>f.id===id) || null; },
  canOpen(){ return this.list().length < MAX; },

  create(ini, opts={}){
    if(!onlyINI(ini)) throw new Error("Iniciales: 3 letras MAYÚSCULAS (sin números/símbolos).");
    if(!this.canOpen()) throw new Error("Límite de 5 fichas activas.");
    if(this.get(ini)) throw new Error("Ya existe una ficha con esas iniciales.");

    const ficha = {
      id: ini,
      createdAt: now(),
      lastActive: now(),
      locked: false,

      age65: !!opts.age65,
      sexo: opts.sexo || "",             // "F" | "M" | ""
      datos: {
        acompana: "solo",                // "solo" | "acompanado"
        convive: "solo",                 // "solo" | "con"
        conQuien: "",
        sector: "urbano",                // "urbano" | "rural"
        ocupacion: "",
        jubilacion: "",                  // texto libre si jubilado/pensionado
        analfabeto: false,
        dependienteSevero: false,
        ayudasTecnicas: false
      },

      anamnesis: {
        antecedentes: [],                // ej: ["HTA","DM2_IR"]
        motivo: [],                      // ["adh","educ","ea"]
        textoLibre: "",
        terapia: {
          carga: "apropiada",            // "muchos" | "apropiada"
          abandono: "no-deja",           // "deja" | "no-deja"
          patologiaPrior: "",
          medicamentoPrior: "",
          conoceNombres: "algunos",      // "conoce" | "algunos" | "no-conoce"
          conocePosologia: "moderado",   // "conoce" | "moderado" | "no-conoce"
          conoceIndicaciones: "moderado" // "conoce" | "moderado" | "no-conoce"
        }
      },

      meds: {
        apsRecetas: [],   // 👈 recetas APS
        secRecetas: [],   // 👈 recetas Secundario
        extra: [],
        automed: [],      // {texto}
        plantas: [],      // {id,nombre}
        enabled: { aps:false, secundario:false, extra:false, automed:false, plantas:false }
      },

      prm: [],                         // {tipo,detalle,fecha}
      eventosAdversos: [],             // {medId,medNombre,efecto,nota?,fecha}
      tests: [],
      calculos: [],
      notas: ""
    };

    this.state.fichas.push(ficha);
    save(this.state);
    return ficha;
  },

  update(id, mutator){
    const f = this.get(id);
    if(!f) throw new Error("Ficha no encontrada.");
    if(f.locked) throw new Error("Ficha bloqueada.");
    mutator(f);
    f.lastActive = now();
    save(this.state);
    return f;
  },

  setLocked(id, locked){
    const f = this.get(id); 
    if(!f) return;
    f.locked = !!locked; 
    f.lastActive = now(); 
    save(this.state);
  },

  remove(id){
    this.state.fichas = (this.state.fichas||[]).filter(x=>x.id!==id);
    save(this.state);
  }
};

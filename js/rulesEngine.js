function enClases(med, clase, mapa){ return (mapa[clase]||[]).includes(med); }
function tieneClase(meds, clase, mapa){ return meds.some(m=>enClases(m, clase, mapa)); }

export function evaluarCriterios({ perfil, meds, criterios }){
  const out = [];
  const mapas = criterios.mapas_clases||{};

  const has = (c)=>meds.some(m=>enClases(m, c, mapas));

  const check = (cond)=>{
    if(!cond) return true;
    if(cond.edad_min && !(perfil.edad>=cond.edad_min)) return false;
    if(cond.egfr_max && !(perfil.egfr && perfil.egfr<=cond.egfr_max)) return false;
    if(cond.clases_meds_incluye && !cond.clases_meds_incluye.every(c=>has(c))) return false;
    if(cond.clases_meds_excluye && !cond.clases_meds_excluye.every(c=>!has(c))) return false;
    return true;
  };

  for(const r of [...(criterios.ppi||[]), ...(criterios.start||[])]){
    if(check(r.condicion)) out.push({ tipo:"criterio", ...r });
  }
  return out;
}

const normalizeMed = (txt = "") =>
  txt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

export function evaluarInteracciones({ meds, interacciones }) {
  const medsSet = new Set((meds || []).map((m) => normalizeMed(m)).filter(Boolean));
  const registros = Array.isArray(interacciones)
    ? interacciones
    : interacciones?.interacciones || [];

  const resultados = [];

  registros.forEach((registro, idx) => {
    const gruposRaw = [registro.grupo_1, registro.grupo_2, registro.grupo_3].filter(Boolean);
    if (!gruposRaw.length) return;

    const gruposEvaluados = gruposRaw.map((grupo, index) => {
      const nombreGrupo = grupo?.nombre || `Grupo ${index + 1}`;
      const listaGrupo = Array.isArray(grupo?.medicamentos) ? grupo.medicamentos : [];
      const normalizados = listaGrupo.map((nombre) => normalizeMed(nombre)).filter(Boolean);
      const encontrados = normalizados.filter((nombre) => medsSet.has(nombre));
      const encontradosUnicos = Array.from(new Set(encontrados));
      return {
        nombre: nombreGrupo,
        medicamentos: listaGrupo,
        encontrados: encontradosUnicos,
      };
    });

    const todosPresentes = gruposEvaluados.every((g) => g.encontrados.length > 0);
    if (!todosPresentes) return;

    resultados.push({
      tipo: registro.triple ? "interaccion_triple" : "interaccion",
      descripcion: registro.comentario || "Interacción detectada.",
      comentario: registro.comentario || "",
      mecanismo: registro.mecanismo || "",
      triple: !!registro.triple,
      grupos: gruposEvaluados,
      idx,
    });
  });

  return resultados;
}
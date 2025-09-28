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

  for(const r of [...(criterios.beers||[]), ...(criterios.stopp||[]), ...(criterios.start||[])]){
    if(check(r.condicion)) out.push({ tipo:"criterio", ...r });
  }
  return out;
}

export function evaluarInteracciones({ meds, interacciones }){
  const out = [];
  const set = new Set(meds);
  // Pares directos
  for(const p of interacciones.pares||[]){
    if(set.has(p.a) && set.has(p.b)) out.push({ tipo:"interaccion", ...p });
  }
  // Por clase
  const mapa = interacciones.mapas_clases||{};
  const tieneC = (c)=>meds.some(m=>(mapa[c]||[]).includes(m));
  for(const r of interacciones.clases||[]){
    if(tieneC(r.claseA) && tieneC(r.claseB)) out.push({ tipo:"interaccion_clase", ...r });
  }
  // Riesgos compuestos
  for(const k of interacciones.riesgos_compuestos||[]){
    const cuenta = (k.incluye_clases||[]).filter(c=>tieneC(c)).length;
    if(cuenta>=2) out.push({ tipo:"riesgo_compuesto", severidad:"alta", ...k });
  }
  return out;
}
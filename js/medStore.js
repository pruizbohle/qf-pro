// js/medStore.js
// Adaptado al nuevo medicamentos.json (array de objetos)

export async function loadAll() {
  try {
    const meds = await fetch("../data/medicamentos.json").then((r) => r.json());

    if (!Array.isArray(meds)) {
      console.error("❌ medicamentos.json no es un array:", meds);
      return { skus: [], skuById: {}, byBase: {}, meds: {} };
    }

    const skus = [];
    const skuById = {};
    const byBase = {};
    const medsMap = {};

    meds.forEach((m) => {
      const base = (m.base_name || "").trim();
      const fuerza = (m.fuerza || "").trim();
      const forma = (m.forma || "").trim();
      const nombreSku = [base, fuerza, forma].filter(Boolean).join(" ").toUpperCase();
      const presentacion = [fuerza, forma].filter(Boolean).join(" ").toUpperCase()

      const programas = {
        aps: Boolean(m.programas?.aps),
        secundario: Boolean(m.programas?.secundario),
        cronico: Boolean(m.programas?.cronico)
      };

      const sku = {
        skuId: m.id,
        base: base.toLowerCase(),
        nombre: nombreSku,
        presentacion,
        forma: normalizarForma(forma),
        programas,
        tags: m.tags || [],
        flags: {
          start: Boolean(m.flags?.start),
          ppi: Boolean(m.flags?.ppi),
          ajusteRenal: Boolean(m.flags?.ajuste_renal?.requerido),
          ajusteRenalDetalle: m.flags?.ajuste_renal?.detalle || null,
          contraindicadoRenal: Boolean(m.flags?.contraindicado_renal?.activo),
          embarazo: m.flags?.embarazo?.riesgo || null
        },
        raw: m
      };
      skus.push(sku);
      skuById[sku.skuId] = sku;

      if (!byBase[sku.base]) byBase[sku.base] = [];
      byBase[sku.base].push(sku);
      
      medsMap[m.id] = {
        id: m.id,
        nombre: [base, fuerza, forma].filter(Boolean).join(" ").trim() || m.id,
        presentacion,
        base,
        etiquetas: m.tags || [],
        aware: m.aware || null,
        programas,
        flags: m.flags || {},
        ram: m.ram?.efectos || [],
        raw: m
      };
    });

    const DB = { skus, skuById, byBase, meds: medsMap };

    console.log("✅ Medicamentos cargados:", skus.length);
    window.DBmeds = DB;

    return DB;
  } catch (e) {
    console.error("❌ Error cargando medicamentos.json:", e);
    return { skus: [], skuById: {}, byBase: {}, meds: {} };
  }
}

function normalizarForma(txt = "") {
  txt = txt.toLowerCase();
  if (txt.includes("comprimido")) return "comprimido";
  if (txt.includes("capsula")) return "capsula";
  if (txt.includes("susp")) return "suspension";
  if (txt.includes("aerosol") || txt.includes("inhal")) return "inhalador";
  if (txt.includes("insulina")) return "insulina";
  return "otro";
}
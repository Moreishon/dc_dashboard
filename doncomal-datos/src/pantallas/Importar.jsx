// =============================================================================
// Importación mensual
// =============================================================================
//
// El camino: elegir archivo → leerlo → clasificar lo que no se reconoce →
// revisar qué se va a reemplazar → subir → resultado.
//
// Dos reglas que no se negocian
// -----------------------------
// 1. Si aparece un modificador o un producto que no está en el catálogo, la
//    importación SE DETIENE. No se adivina. Un guisado nuevo clasificado a ojo
//    contamina el histórico y nadie se entera hasta que los números no cuadran
//    meses después.
//
// 2. Cada mes se sube por separado. Si el archivo trae tres meses y el segundo
//    falla, el primero ya quedó guardado y solo hay que repetir los que falten.
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { armarCatalogos, procesar, TIPOS_VALIDOS } from '../poster.js';
import {
  traerCatalogos, traerPeriodos, importarMes,
  guardarModificadores, guardarProductos,
} from '../datos.js';
import {
  C, tarjeta, etiqueta, campo, boton, botonSecundario, botonApagado,
  nota, pesos, numero, nombreMes,
} from '../estilo.js';

// ─── piezas sueltas, fuera del componente para que React no las remonte ──────

function Dato({ etiqueta: et, valor, ancho }) {
  return (
    <div style={{ flex: ancho || 1, minWidth: '90px' }}>
      <div style={{ fontSize: '10.5px', color: C.tinta4, textTransform: 'uppercase',
                    letterSpacing: '0.07em', fontWeight: 600, marginBottom: '3px' }}>
        {et}
      </div>
      <div style={{ fontSize: '17px', fontWeight: 600, color: C.tinta,
                    fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </div>
    </div>
  );
}

function Paso({ n, de, texto }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px',
                  marginBottom: '16px' }}>
      <div style={{ flex: 1, height: '4px', background: C.lineaFuerte,
                    borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${(n / de) * 100}%`, height: '100%',
                      background: C.terracota, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: '12px', color: C.tinta3, whiteSpace: 'nowrap' }}>
        {texto}
      </span>
    </div>
  );
}

function FilaMes({ mes, yaExiste }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '11px 0',
                  borderBottom: `1px solid ${C.linea}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '15px' }}>
          {nombreMes(mes.periodo)}
        </div>
        <div style={{ fontSize: '12.5px', color: C.tinta3 }}>
          {numero(mes.detalle.length)} renglones · {numero(mes.unidades)} unidades
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600, fontSize: '15px',
                      fontVariantNumeric: 'tabular-nums' }}>
          {pesos(mes.ingresos)}
        </div>
        <div style={{ fontSize: '11.5px',
                      color: yaExiste ? C.aviso : C.bien, fontWeight: 600 }}>
          {yaExiste ? 'reemplaza lo que hay' : 'nuevo'}
        </div>
      </div>
    </div>
  );
}

// ─── pantalla ────────────────────────────────────────────────────────────────

const TIPOS_ELEGIBLES = TIPOS_VALIDOS.filter((t) => t !== 'AMBIGUO')
  .concat(['AMBIGUO']);

const AYUDA_TIPO = {
  GUISADO: 'El relleno principal: deshebrada, chicharrón, papa con chorizo.',
  EXTRA: 'Algo que se agrega y se cobra aparte.',
  PETICION: 'Una indicación sin costo: sin crema, poca salsa.',
  VARIANTE: 'Una forma del mismo producto: de maíz, integral.',
  COMPOSICION: 'Cómo se arma el pedido, no qué lleva.',
  CANT_SURTIDO: 'Un número que dice cuántas piezas trae.',
  AMBIGUO: 'Es guisado si va primero y extra si va después. Úsalo solo si de verdad depende del lugar.',
};

export default function Importar({ perfil }) {
  const [etapa, setEtapa] = useState('elegir');
  const [error, setError] = useState('');
  const [catalogos, setCatalogos] = useState(null);
  const [periodosBD, setPeriodosBD] = useState([]);
  const [lectura, setLectura] = useState(null);
  const [avance, setAvance] = useState({ hechos: 0, total: 0, mes: '' });
  const [resultados, setResultados] = useState([]);
  const [tiposElegidos, setTiposElegidos] = useState({});
  const [prodsElegidos, setProdsElegidos] = useState({});
  const [guardandoCat, setGuardandoCat] = useState(false);

  const archivoProductos = useRef(null);
  const archivoVentas = useRef(null);
  const [nombreProductos, setNombreProductos] = useState('');
  const [nombreVentas, setNombreVentas] = useState('');

  const puedeImportar = perfil && (perfil.rol === 'admin' || perfil.rol === 'gerente');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cat, per] = await Promise.all([traerCatalogos(), traerPeriodos()]);
        if (!vivo) return;
        setCatalogos(armarCatalogos(cat.filasMods, cat.filasProds));
        setPeriodosBD(per);
      } catch (e) {
        if (vivo) setError(e.message);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // La librería que lee xlsx pesa medio megabyte y solo hace falta aquí. Se
  // carga cuando se elige un archivo, no al abrir la app: así entrar es rápido
  // incluso con datos móviles.
  async function matrizDe(archivo) {
    const XLSX = await import('xlsx');
    const buffer = await archivo.arrayBuffer();
    const wb = XLSX.read(buffer, { raw: true, cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  }

  /**
   * `cat` se recibe como argumento a propósito. Después de clasificar hay que
   * volver a leer con el catálogo recién guardado, y el estado de React todavía
   * no se ha actualizado en ese momento: leerlo de `catalogos` daría el catálogo
   * viejo y el archivo volvería a salir "sin clasificar" para siempre.
   */
  async function leerArchivos(cat) {
    const usar = cat || catalogos;
    const fp = archivoProductos.current?.files?.[0];
    if (!fp) { setError('Falta el archivo de productos.'); return; }
    if (!usar) { setError('Todavía no cargan los catálogos.'); return; }
    setError(''); setEtapa('leyendo');

    try {
      const matrizProductos = await matrizDe(fp);
      const fv = archivoVentas.current?.files?.[0];
      const matrizVentas = fv ? await matrizDe(fv) : null;

      const r = procesar({ matrizProductos, matrizVentas, catalogos: usar, archivo: fp.name });
      if (r.error) { setError(r.error); setEtapa('elegir'); return; }

      setLectura(r);
      const faltanMods = Object.keys(r.sinClasificar).length > 0;
      const faltanProds = Object.keys(r.productosNuevos).length > 0;
      setEtapa(faltanMods || faltanProds ? 'clasificar' : 'revisar');
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
      setEtapa('elegir');
    }
  }

  async function guardarClasificacion() {
    const mods = Object.entries(lectura.sinClasificar);
    const prods = Object.entries(lectura.productosNuevos);

    const sinTipo = mods.filter(([t]) => !tiposElegidos[t]);
    const sinFamilia = prods.filter(([p]) => !prodsElegidos[p]?.familia);
    if (sinTipo.length || sinFamilia.length) {
      setError('Falta clasificar todo antes de seguir.');
      return;
    }

    setError(''); setGuardandoCat(true);
    try {
      if (mods.length) {
        await guardarModificadores(mods.map(([token]) => ({
          modificador_original: token,
          valor_normalizado: token,
          tipo: tiposElegidos[token],
          activo: true,
          nota: 'Clasificado desde la app',
        })));
      }
      if (prods.length) {
        await guardarProductos(prods.map(([producto]) => {
          const p = prodsElegidos[producto];
          return {
            producto,
            familia: p.familia,
            unidad_venta: p.unidad_venta || 'ORDEN',
            piezas_por_orden: parseInt(p.piezas_por_orden, 10) || 1,
            lleva_guisado: !!p.lleva_guisado,
            activo: true,
          };
        }));
      }
      // Se vuelve a leer el archivo con el catálogo ya completo, para que los
      // renglones queden clasificados de verdad y no solo "aceptados".
      const cat = await traerCatalogos();
      const nuevos = armarCatalogos(cat.filasMods, cat.filasProds);
      setCatalogos(nuevos);
      setGuardandoCat(false);
      setTiposElegidos({}); setProdsElegidos({});
      await leerArchivos(nuevos);
    } catch (e) {
      setError(e.message);
      setGuardandoCat(false);
    }
  }

  async function subir() {
    setError(''); setEtapa('subiendo');
    const salida = [];
    setAvance({ hechos: 0, total: lectura.meses.length, mes: '' });

    for (let i = 0; i < lectura.meses.length; i++) {
      const mes = lectura.meses[i];
      setAvance({ hechos: i, total: lectura.meses.length, mes: nombreMes(mes.periodo) });
      try {
        const r = await importarMes({
          periodo: mes.periodo,
          archivo: lectura.archivo,
          detalle: mes.detalle,
          mods: mes.mods,
          dia: mes.dia,
          qa: { incidencias: lectura.incidencias, origen: 'app' },
        });
        salida.push({ periodo: mes.periodo, ok: true, ...r });
      } catch (e) {
        salida.push({ periodo: mes.periodo, ok: false, error: e.message });
      }
      setResultados([...salida]);
    }
    setAvance({ hechos: lectura.meses.length, total: lectura.meses.length, mes: '' });

    try { setPeriodosBD(await traerPeriodos()); } catch { /* no es grave */ }
    setEtapa('hecho');
  }

  function reiniciar() {
    setLectura(null); setResultados([]); setError('');
    setTiposElegidos({}); setProdsElegidos({});
    setNombreProductos(''); setNombreVentas('');
    if (archivoProductos.current) archivoProductos.current.value = '';
    if (archivoVentas.current) archivoVentas.current.value = '';
    setEtapa('elegir');
  }

  const existentes = new Set(periodosBD.map((p) => p.periodo));

  // ─── vistas ────────────────────────────────────────────────────────────────

  if (!puedeImportar) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={nota('aviso')}>
          Tu usuario tiene rol <b>{perfil?.rol || 'sin rol'}</b>, que puede consultar
          pero no importar. Para subir ventas se necesita rol de administrador o gerente.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>

      {error && <div style={nota('error')}>{error}</div>}

      {/* ── elegir ── */}
      {etapa === 'elegir' && (
        <>
          <div style={tarjeta()}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>
              Subir un mes
            </h2>
            <p style={{ fontSize: '13.5px', color: C.tinta3, marginBottom: '18px',
                        lineHeight: 1.55 }}>
              Exporta de Poster el reporte de productos con “Mostrar días” activado.
              Si el archivo trae varios meses, se suben todos.
            </p>

            <label style={etiqueta}>Reporte de productos · obligatorio</label>
            <input
              ref={archivoProductos} type="file" accept=".xlsx,.xls"
              onChange={(e) => setNombreProductos(e.target.files?.[0]?.name || '')}
              style={{ ...campo(false), padding: '10px', marginBottom: '4px' }}
            />
            {nombreProductos && (
              <p style={{ fontSize: '12.5px', color: C.bien, marginBottom: '14px' }}>
                {nombreProductos}
              </p>
            )}

            <label style={{ ...etiqueta, marginTop: '14px' }}>
              Reporte de ventas · opcional
            </label>
            <input
              ref={archivoVentas} type="file" accept=".xlsx,.xls"
              onChange={(e) => setNombreVentas(e.target.files?.[0]?.name || '')}
              style={{ ...campo(false), padding: '10px', marginBottom: '4px' }}
            />
            <p style={{ fontSize: '12.5px', color: nombreVentas ? C.bien : C.tinta4,
                        marginBottom: '18px', lineHeight: 1.5 }}>
              {nombreVentas || 'Sin este archivo no hay recibos, clientes ni ticket ' +
                'promedio, y el envío cobrado por el campo de Poster no se puede separar.'}
            </p>

            <button
              // Sin la flecha, React pasaría el evento del clic como si fuera
              // el catálogo.
              onClick={() => leerArchivos()}
              disabled={!catalogos || !nombreProductos}
              style={{ ...boton(), ...((!catalogos || !nombreProductos) ? botonApagado : {}) }}
            >
              {catalogos ? 'Leer el archivo' : 'Cargando catálogos…'}
            </button>
          </div>

          {periodosBD.length > 0 && (
            <div style={tarjeta()}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: C.tinta4,
                           textTransform: 'uppercase', letterSpacing: '0.07em',
                           marginBottom: '10px' }}>
                Lo que ya está cargado
              </h3>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <Dato etiqueta="Meses" valor={numero(periodosBD.length)} />
                <Dato etiqueta="Más reciente"
                      valor={nombreMes(periodosBD[0].periodo)} ancho={2} />
              </div>
              <p style={{ fontSize: '12.5px', color: C.tinta3, lineHeight: 1.5 }}>
                Si subes un mes que ya está, se reemplaza completo. No se duplica.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── leyendo ── */}
      {etapa === 'leyendo' && (
        <div style={{ ...tarjeta(), textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: '15px', color: C.tinta2 }}>Leyendo el archivo…</p>
          <p style={{ fontSize: '13px', color: C.tinta4, marginTop: '6px' }}>
            Un mes tarda un segundo; un año entero, unos cuantos.
          </p>
        </div>
      )}

      {/* ── clasificar ── */}
      {etapa === 'clasificar' && lectura && (
        <>
          <div style={nota('aviso')}>
            El archivo trae cosas que el catálogo no conoce. <b>La importación se
            detiene aquí a propósito</b>: clasificarlas a ojo metería datos que no
            cuadran con el histórico y no habría cómo darse cuenta después.
          </div>

          {Object.keys(lectura.sinClasificar).length > 0 && (
            <div style={tarjeta()}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                Modificadores nuevos ({Object.keys(lectura.sinClasificar).length})
              </h3>
              {Object.entries(lectura.sinClasificar)
                .sort((a, b) => b[1] - a[1])
                .map(([token, veces]) => (
                  <div key={token} style={{ marginBottom: '16px',
                                            paddingBottom: '16px',
                                            borderBottom: `1px solid ${C.linea}` }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{token}</div>
                    <div style={{ fontSize: '12.5px', color: C.tinta3,
                                  marginBottom: '9px' }}>
                      aparece {numero(veces)} {veces === 1 ? 'vez' : 'veces'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {TIPOS_ELEGIBLES.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTiposElegidos((x) => ({ ...x, [token]: t }))}
                          title={AYUDA_TIPO[t]}
                          style={{
                            padding: '6px 12px', borderRadius: '18px',
                            fontSize: '12.5px', fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'inherit',
                            border: tiposElegidos[token] === t
                              ? 'none' : `1.5px solid ${C.lineaFuerte}`,
                            background: tiposElegidos[token] === t ? C.terracota : 'white',
                            color: tiposElegidos[token] === t ? 'white' : C.tinta3,
                          }}
                        >{t}</button>
                      ))}
                    </div>
                    {tiposElegidos[token] && (
                      <p style={{ fontSize: '12px', color: C.tinta4, marginTop: '7px' }}>
                        {AYUDA_TIPO[tiposElegidos[token]]}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {Object.keys(lectura.productosNuevos).length > 0 && (
            <div style={tarjeta()}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                Productos nuevos ({Object.keys(lectura.productosNuevos).length})
              </h3>
              {Object.entries(lectura.productosNuevos)
                .sort((a, b) => b[1] - a[1])
                .map(([producto, veces]) => {
                  const p = prodsElegidos[producto] || {};
                  const set = (k, v) => setProdsElegidos((x) => ({
                    ...x, [producto]: { ...(x[producto] || {}), [k]: v },
                  }));
                  return (
                    <div key={producto} style={{ marginBottom: '16px',
                                                 paddingBottom: '16px',
                                                 borderBottom: `1px solid ${C.linea}` }}>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{producto}</div>
                      <div style={{ fontSize: '12.5px', color: C.tinta3,
                                    marginBottom: '10px' }}>
                        aparece {numero(veces)} {veces === 1 ? 'vez' : 'veces'}
                      </div>

                      <label style={etiqueta}>Familia</label>
                      <input
                        value={p.familia || ''}
                        onChange={(e) => set('familia', e.target.value)}
                        placeholder="Gordita, Enchilada, Bebida…"
                        style={{ ...campo(false), marginBottom: '10px' }}
                      />

                      <label style={etiqueta}>Se vende por</label>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {['ORDEN', 'PIEZA'].map((u) => (
                          <button
                            key={u}
                            onClick={() => set('unidad_venta', u)}
                            style={{
                              padding: '8px 16px', borderRadius: '18px',
                              fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                              border: (p.unidad_venta || 'ORDEN') === u
                                ? 'none' : `1.5px solid ${C.lineaFuerte}`,
                              background: (p.unidad_venta || 'ORDEN') === u
                                ? C.terracota : 'white',
                              color: (p.unidad_venta || 'ORDEN') === u ? 'white' : C.tinta3,
                            }}
                          >{u === 'ORDEN' ? 'Orden' : 'Pieza'}</button>
                        ))}
                      </div>

                      <label style={etiqueta}>Piezas por orden</label>
                      <input
                        type="number" min="1" inputMode="numeric"
                        value={p.piezas_por_orden ?? ''}
                        onChange={(e) => set('piezas_por_orden', e.target.value)}
                        placeholder="1"
                        style={{ ...campo(false), marginBottom: '10px' }}
                      />

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px',
                                      fontSize: '14px', color: C.tinta2 }}>
                        <input
                          type="checkbox" checked={!!p.lleva_guisado}
                          onChange={(e) => set('lleva_guisado', e.target.checked)}
                          style={{ width: '18px', height: '18px' }}
                        />
                        Lleva guisado
                      </label>
                    </div>
                  );
                })}
            </div>
          )}

          <button
            onClick={guardarClasificacion}
            disabled={guardandoCat}
            style={{ ...boton(), ...(guardandoCat ? botonApagado : {}) }}
          >
            {guardandoCat ? 'Guardando…' : 'Guardar en el catálogo y volver a leer'}
          </button>
          <button onClick={reiniciar}
                  style={{ ...botonSecundario(), marginTop: '10px' }}>
            Cancelar
          </button>
        </>
      )}

      {/* ── revisar ── */}
      {etapa === 'revisar' && lectura && (
        <>
          <div style={tarjeta()}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px' }}>
              Esto es lo que trae el archivo
            </h2>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap',
                          marginBottom: '4px' }}>
              <Dato etiqueta="Renglones" valor={numero(lectura.totales.renglones)} />
              <Dato etiqueta="Unidades" valor={numero(lectura.totales.unidades)} />
              <Dato etiqueta="Ingresos" valor={pesos(lectura.totales.ingresos)} ancho={1.4} />
            </div>
          </div>

          <div style={tarjeta()}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: C.tinta4,
                         textTransform: 'uppercase', letterSpacing: '0.07em',
                         marginBottom: '4px' }}>
              {lectura.meses.length === 1 ? 'El mes' : `Los ${lectura.meses.length} meses`}
            </h3>
            {lectura.meses.map((m) => (
              <FilaMes key={m.periodo} mes={m} yaExiste={existentes.has(m.periodo)} />
            ))}
          </div>

          {lectura.meses.some((m) => existentes.has(m.periodo)) && (
            <div style={nota('aviso')}>
              Los meses marcados en café se reemplazan completos: primero se borra
              lo que hay y luego entra lo nuevo, todo en un solo movimiento. Si algo
              falla a media carga, ese mes se queda como estaba.
            </div>
          )}

          {(lectura.incidencias.sinFecha > 0 || lectura.incidencias.sinNumero > 0) && (
            <div style={nota('aviso')}>
              Se saltaron renglones ilegibles:{' '}
              {lectura.incidencias.sinFecha > 0 &&
                `${lectura.incidencias.sinFecha} sin fecha`}
              {lectura.incidencias.sinFecha > 0 && lectura.incidencias.sinNumero > 0 && ', '}
              {lectura.incidencias.sinNumero > 0 &&
                `${lectura.incidencias.sinNumero} sin cantidad`}.
              {' '}Suele ser el renglón de totales que Poster pone al final.
            </div>
          )}

          <button onClick={subir} style={boton()}>
            Subir {lectura.meses.length === 1
              ? nombreMes(lectura.meses[0].periodo)
              : `los ${lectura.meses.length} meses`}
          </button>
          <button onClick={reiniciar}
                  style={{ ...botonSecundario(), marginTop: '10px' }}>
            Elegir otro archivo
          </button>
        </>
      )}

      {/* ── subiendo ── */}
      {etapa === 'subiendo' && (
        <div style={tarjeta()}>
          <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px' }}>
            Subiendo
          </h2>
          <Paso n={avance.hechos} de={avance.total || 1}
                texto={`${avance.hechos} de ${avance.total}`} />
          {avance.mes && (
            <p style={{ fontSize: '14px', color: C.tinta2 }}>
              Guardando {avance.mes}…
            </p>
          )}
          <p style={{ fontSize: '12.5px', color: C.tinta4, marginTop: '10px',
                      lineHeight: 1.5 }}>
            No cierres la pestaña. Cada mes entra completo o no entra:
            si se corta, nada queda a medias.
          </p>
        </div>
      )}

      {/* ── hecho ── */}
      {etapa === 'hecho' && (
        <>
          {resultados.every((r) => r.ok) ? (
            <div style={nota('bien')}>
              Listo. {resultados.length === 1 ? 'El mes quedó guardado.'
                : `Los ${resultados.length} meses quedaron guardados.`}
            </div>
          ) : (
            <div style={nota('error')}>
              Algunos meses no se pudieron guardar. Los que sí, ya están.
              Puedes volver a subir el mismo archivo: los que ya entraron se
              reemplazan por lo mismo y no se duplican.
            </div>
          )}

          <div style={tarjeta()}>
            {resultados.map((r) => (
              <div key={r.periodo} style={{ padding: '11px 0',
                                            borderBottom: `1px solid ${C.linea}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{nombreMes(r.periodo)}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600,
                                 color: r.ok ? C.bien : C.error }}>
                    {r.ok ? 'guardado' : 'falló'}
                  </span>
                </div>
                {r.ok ? (
                  <div style={{ fontSize: '12.5px', color: C.tinta3, marginTop: '3px' }}>
                    {numero(r.renglones)} renglones · {numero(r.modificadores)} modificadores
                    {' · '}{pesos(r.ingresos)}
                    {r.renglones_antes > 0 &&
                      ` · reemplazó ${numero(r.renglones_antes)}`}
                  </div>
                ) : (
                  <div style={{ fontSize: '12.5px', color: C.error, marginTop: '3px' }}>
                    {r.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={reiniciar} style={boton()}>Subir otro archivo</button>
        </>
      )}
    </div>
  );
}

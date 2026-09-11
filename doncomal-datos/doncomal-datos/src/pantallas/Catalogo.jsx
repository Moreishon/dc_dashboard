// =============================================================================
// Catálogo · en qué sección del menú va cada producto
// =============================================================================
//
// Aquí se decide la categoría de los 82 productos. La decisión es de Octavio,
// no mía ni de Poster: el POS no sabe qué es un "antojito" y nunca va a saber.
//
// Dos cosas que esta pantalla hace a propósito
// --------------------------------------------
// **Enseña las ventas al lado del menú.** Clasificar a ciegas es adivinar. Con
// las unidades de los tres años y la fecha de la última venta enfrente, casi
// todas las dudas se resuelven solas: "Bistec 1 Pza." con 14 unidades en tres
// años es claramente un extra, no un platillo.
//
// **Grita cuando algo se quedó sin clasificar.** Un producto nuevo entra sin
// categoría, y si nadie lo nota se vuelve invisible en los cortes por sección
// mientras sigue apareciendo en los totales. Esa discrepancia es de las que se
// encuentran tres meses después. Por eso los sin clasificar salen hasta arriba,
// en rojo, y con un aviso que no se puede cerrar.
//
// Se guarda producto por producto, en el momento. No hay botón de "guardar
// todo": un cambio que no se guardó y parece guardado es peor que un clic más.
// =============================================================================

import { useMemo, useState, useEffect } from 'react';
import { traerCatalogoProductos, traerCategorias, guardarCategoria,
         guardarGuisadosIncluidos } from '../datos.js';
import {
  C, tarjeta, tituloTarjeta, nota, pastilla, campo,
  pesos, numero, fechaCorta,
} from '../estilo.js';

const SIN = '— sin categoría —';

function Fila({ p, categorias, puedeEditar, onGuardar, onGuisados, estado }) {
  const falta = !p.categoria;
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      padding: '11px 12px',
      borderRadius: '10px',
      background: falta ? C.errorSuave : 'transparent',
      borderBottom: `1px solid ${C.linea}`,
    }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        <div style={{ fontSize: '14.5px', fontWeight: 500, color: C.tinta }}>
          {p.producto}
        </div>
        <div style={{ fontSize: '11.5px', color: C.tinta4, marginTop: '2px',
                      fontVariantNumeric: 'tabular-nums' }}>
          {numero(p.unidades)} unidades · {pesos(p.ingresos)}
          {p.ultima_venta
            ? ` · última venta ${fechaCorta(p.ultima_venta)}`
            : ' · nunca se ha vendido'}
        </div>
      </div>

      {puedeEditar ? (
        <select
          value={p.categoria || ''}
          onChange={(e) => onGuardar(p.producto, e.target.value)}
          disabled={estado === 'guardando'}
          style={{
            ...campo(falta), width: 'auto', flex: '0 0 auto', minWidth: '150px',
            minHeight: '40px', padding: '8px 12px', fontSize: '14px',
            cursor: 'pointer',
            opacity: estado === 'guardando' ? 0.5 : 1,
          }}>
          <option value="">{SIN}</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>{c.categoria}</option>
          ))}
        </select>
      ) : (
        <span style={{ fontSize: '13.5px', color: falta ? C.rojo : C.tinta2,
                       flex: 'none' }}>
          {p.categoria || SIN}
        </span>
      )}

      {/* Cuántos guisados trae el precio. Solo aparece donde la regla aplica:
          en lo que se vende por pieza. En una orden de cuatro empanadas, dos
          guisos son dos rellenos y no hay nada que cobrar. */}
      {p.unidad_venta === 'PIEZA' && (
        <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center',
                       gap: '6px', fontSize: '12px', color: C.tinta3 }}>
          incluye
          {puedeEditar ? (
            <select
              value={p.guisados_incluidos ?? 1}
              onChange={(e) => onGuisados(p.producto, +e.target.value)}
              style={{ ...campo(false), width: 'auto', minWidth: 0,
                       minHeight: '34px', padding: '5px 8px', fontSize: '13px',
                       cursor: 'pointer' }}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : <b>{p.guisados_incluidos ?? 1}</b>}
          {(p.guisados_incluidos ?? 1) === 1 ? 'guiso' : 'guisos'}
        </span>
      )}

      <span style={{ flex: 'none', fontSize: '12px', width: '68px',
                     textAlign: 'right',
                     color: estado === 'listo' ? C.bien
                          : estado === 'error' ? C.rojo : 'transparent' }}>
        {estado === 'listo' ? 'guardado'
          : estado === 'error' ? 'no se pudo' : '·'}
      </span>
    </div>
  );
}

export default function Catalogo({ perfil }) {
  const [productos, setProductos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [estados, setEstados] = useState({});

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'gerente';

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [ps, cs] = await Promise.all([
          traerCatalogoProductos(), traerCategorias(),
        ]);
        if (!vivo) return;
        setProductos(ps); setCategorias(cs); setError('');
      } catch (e) {
        if (vivo) setError([e.message, e.detalle].filter(Boolean).join(' — '));
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function guardarGuisos(producto, cuantos) {
    const antes = productos.find((p) => p.producto === producto)?.guisados_incluidos ?? 1;
    setProductos((ps) => ps.map((p) =>
      p.producto === producto ? { ...p, guisados_incluidos: cuantos } : p));
    setEstados((e) => ({ ...e, [producto]: 'guardando' }));
    try {
      await guardarGuisadosIncluidos(producto, cuantos);
      setEstados((e) => ({ ...e, [producto]: 'listo' }));
      setTimeout(() => setEstados((e) => ({ ...e, [producto]: null })), 1800);
    } catch (err) {
      setProductos((ps) => ps.map((p) =>
        p.producto === producto ? { ...p, guisados_incluidos: antes } : p));
      setEstados((e) => ({ ...e, [producto]: 'error' }));
      setError([err.message, err.detalle].filter(Boolean).join(' — '));
    }
  }

  async function guardar(producto, categoria) {
    // Se pinta el cambio de inmediato y se corrige si la base dice que no.
    // Esperar la red para mover un menú desplegable se siente roto.
    const antes = productos.find((p) => p.producto === producto)?.categoria ?? null;
    setProductos((ps) => ps.map((p) =>
      p.producto === producto ? { ...p, categoria: categoria || null } : p));
    setEstados((e) => ({ ...e, [producto]: 'guardando' }));
    try {
      await guardarCategoria(producto, categoria);
      setEstados((e) => ({ ...e, [producto]: 'listo' }));
      setTimeout(() => setEstados((e) => ({ ...e, [producto]: null })), 1800);
    } catch (err) {
      setProductos((ps) => ps.map((p) =>
        p.producto === producto ? { ...p, categoria: antes } : p));
      setEstados((e) => ({ ...e, [producto]: 'error' }));
      setError([err.message, err.detalle].filter(Boolean).join(' — '));
    }
  }

  const calc = useMemo(() => {
    if (!productos) return null;
    const sinCategoria = productos.filter((p) => !p.categoria);
    const cuenta = new Map();
    for (const p of productos) {
      const k = p.categoria || SIN;
      const a = cuenta.get(k) || { productos: 0, unidades: 0, ingresos: 0 };
      a.productos++;
      a.unidades += +p.unidades || 0;
      a.ingresos += +p.ingresos || 0;
      cuenta.set(k, a);
    }
    const q = busca.trim().toLowerCase();
    const visibles = productos.filter((p) =>
      (filtro === 'todas'
        || (filtro === SIN ? !p.categoria : p.categoria === filtro))
      && (!q || p.producto.toLowerCase().includes(q)));
    return { sinCategoria, cuenta, visibles };
  }, [productos, busca, filtro]);

  if (error && !productos) {
    return <div style={{ padding: '18px' }}><div style={nota('error')}>{error}</div></div>;
  }
  if (!calc) {
    return <div style={{ padding: '30px 18px', color: C.tinta3, fontSize: '14px' }}>
      Cargando el catálogo…
    </div>;
  }

  return (
    <div style={{ padding: '18px',
                  paddingBottom: 'calc(44px + env(safe-area-inset-bottom))' }}>

      {error && <div style={nota('error')}>{error}</div>}

      {calc.sinCategoria.length > 0 && (
        <div style={nota('error')}>
          <b>{calc.sinCategoria.length}{' '}
          {calc.sinCategoria.length === 1 ? 'producto no tiene' : 'productos no tienen'}
          {' '}categoría.</b> Salen en los totales del tablero pero no en ningún
          corte por sección, así que las dos cifras no van a cuadrar hasta que
          los clasifiques. Están hasta arriba, marcados en rojo.
        </div>
      )}

      <div style={tarjeta()}>
        <h3 style={tituloTarjeta}>Cómo va repartido el menú</h3>
        <p style={{ fontSize: '13px', color: C.tinta3, margin: '4px 0 14px',
                    lineHeight: 1.5 }}>
          Las secciones con su número de productos y lo que llevan vendido en
          toda la historia. Es el reparto del catálogo, no el del mes.
        </p>
        <div style={{ display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto auto', gap: '7px 14px',
                      fontSize: '13.5px', alignItems: 'baseline' }}>
          {[...calc.cuenta.entries()]
            .sort((a, b) => b[1].ingresos - a[1].ingresos)
            .map(([cat, a]) => (
              <Renglon key={cat} cat={cat} a={a} />
            ))}
        </div>
      </div>

      <div style={{ ...tarjeta(), position: 'sticky', top: '96px', zIndex: 4 }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar un producto…"
          style={{ ...campo(false), marginBottom: '12px' }}
        />
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
          <button onClick={() => setFiltro('todas')}
                  style={pastilla(filtro === 'todas')}>
            Todas ({productos.length})
          </button>
          {categorias.map((c) => (
            <button key={c.categoria} onClick={() => setFiltro(c.categoria)}
                    style={pastilla(filtro === c.categoria)}>
              {c.categoria} ({calc.cuenta.get(c.categoria)?.productos || 0})
            </button>
          ))}
          {calc.sinCategoria.length > 0 && (
            <button onClick={() => setFiltro(SIN)}
                    style={pastilla(filtro === SIN,
                      filtro === SIN ? { background: C.rojo } : { color: C.rojo })}>
              Sin categoría ({calc.sinCategoria.length})
            </button>
          )}
        </div>
      </div>

      <div style={tarjeta()}>
        <h3 style={tituloTarjeta}>
          {calc.visibles.length} {calc.visibles.length === 1 ? 'producto' : 'productos'}
        </h3>
        <p style={{ fontSize: '13px', color: C.tinta3, margin: '4px 0 10px',
                    lineHeight: 1.5 }}>
          {puedeEditar
            ? 'Cambia la categoría en el menú de la derecha; se guarda solo. La reclasificación aplica a los tres años de historia de inmediato — no hay que volver a importar nada.'
            : 'Tu rol puede consultar el catálogo pero no cambiarlo.'}
        </p>
        {calc.visibles.length === 0 ? (
          <p style={{ fontSize: '13.5px', color: C.tinta3 }}>
            Ningún producto coincide con la búsqueda.
          </p>
        ) : (
          // Los sin clasificar primero: son los que hay que atender.
          [...calc.visibles]
            .sort((a, b) => (!!a.categoria - !!b.categoria)
                         || (+b.unidades || 0) - (+a.unidades || 0))
            .map((p) => (
              <Fila key={p.producto} p={p} categorias={categorias}
                    puedeEditar={puedeEditar} onGuardar={guardar}
                    onGuisados={guardarGuisos}
                    estado={estados[p.producto]} />
            ))
        )}
      </div>

      <div style={nota('aviso')}>
        <b>"Incluye N guisos" decide qué se cuenta como extra.</b> El guisado que
        pase de esos se cobra, y el tablero lo cuenta entre los extras. Una
        gordita incluye uno: si lleva dos, el segundo se paga. Una migada
        incluye dos. Solo sale en lo que se vende por pieza — en una orden de
        cuatro empanadas, dos guisos son dos rellenos y no hay nada que cobrar.
      </div>

      <div style={nota('aviso')}>
        <b>Los extras de aquí no son los de Guisados.</b> En esta lista, "Extras"
        son productos que se cobran como renglón —salsas, tortillas, porciones,
        piezas sueltas— y tienen dinero propio. Los extras que van dentro del
        precio de un platillo —Queso, Frijoles, Bistec— no son productos: son
        modificadores, no tienen precio propio y se cuentan en Guisados. Sumar
        los dos daría un total que no significa nada.
      </div>
    </div>
  );
}

function Renglon({ cat, a }) {
  const falta = cat === SIN;
  return (
    <>
      <span style={{ fontWeight: 600, color: falta ? C.rojo : C.tinta }}>{cat}</span>
      <span style={{ color: C.tinta4, fontSize: '12.5px' }}>
        {a.productos} {a.productos === 1 ? 'producto' : 'productos'}
      </span>
      <span style={{ textAlign: 'right', color: C.tinta2,
                     fontVariantNumeric: 'tabular-nums' }}>
        {numero(a.unidades)} u.
      </span>
      <span style={{ textAlign: 'right', fontWeight: 600,
                     fontVariantNumeric: 'tabular-nums' }}>
        {pesos(a.ingresos)}
      </span>
    </>
  );
}

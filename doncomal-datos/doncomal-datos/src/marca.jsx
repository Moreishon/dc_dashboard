// =============================================================================
// La marca
// =============================================================================
//
// Tres piezas del mismo logotipo, cada una para un lugar distinto:
//
//   Isotipo             Solo la cara con el sombrero. Cuadrada. Para cuando hay
//                       poco espacio y el nombre ya se sabe: el encabezado en
//                       celular, el ícono de la app.
//   Imagotipo           Cara + nombre, en horizontal. Para el encabezado en
//                       pantalla ancha, donde sí cabe leerlo.
//   ImagotipoVertical   Cara arriba, nombre abajo. Para las dos pantallas donde
//                       la marca es lo único que hay: la de carga y la de
//                       entrada.
//
// Los archivos son blancos sobre transparente. Eso los hace perfectos para las
// superficies oscuras de la app —el encabezado, la carga, el login— e
// invisibles sobre el papel crema del cuerpo. Si algún día hace falta la marca
// sobre fondo claro, hay que pedir la versión en negro, no teñir esta.
//
// El alto se fija y el ancho se deja en auto: así el logo no se deforma nunca,
// aunque cambie el archivo.
// =============================================================================

const base = (alto) => ({
  height: `${alto}px`,
  width: 'auto',
  display: 'block',
  flex: 'none',
});

export function Isotipo({ alto = 30, ...resto }) {
  return <img src="/logo/isotipo.png" alt="Don Comal" style={base(alto)} {...resto} />;
}

export function Imagotipo({ alto = 30, ...resto }) {
  return <img src="/logo/imagotipo.png" alt="Don Comal" style={base(alto)} {...resto} />;
}

export function ImagotipoVertical({ alto = 150, ...resto }) {
  return (
    <img src="/logo/imagotipo-vertical.png" alt="Don Comal"
         style={{ ...base(alto), margin: '0 auto' }} {...resto} />
  );
}

/** El nombre solo, sin la cara. Hoy no se usa; queda por si hace falta. */
export function Logotipo({ alto = 34, ...resto }) {
  return <img src="/logo/logotipo.png" alt="Don Comal" style={base(alto)} {...resto} />;
}

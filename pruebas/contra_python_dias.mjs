// ¿El grano diario que produce el parser reproduce el histórico ya cargado?
import XLSX from 'xlsx';
import fs from 'node:fs';
import { armarCatalogos, procesar } from '../src/poster.js';
const BASE='/home/claude/doncomal';
function leerCSV(ruta){const t=fs.readFileSync(ruta,'utf-8');const filas=[];let campo='',fila=[],q=false;
for(let i=0;i<t.length;i++){const c=t[i];
if(q){if(c==='"'){if(t[i+1]==='"'){campo+='"';i++;}else q=false;}else campo+=c;}
else if(c==='"')q=true;else if(c===','){fila.push(campo);campo='';}
else if(c==='\n'){fila.push(campo);filas.push(fila);fila=[];campo='';}
else if(c!=='\r')campo+=c;}
if(campo!==''||fila.length){fila.push(campo);filas.push(fila);}
const cols=filas.shift();return filas.filter(f=>f.length===cols.length).map(f=>Object.fromEntries(cols.map((c,i)=>[c,f[i]])));}

const cat=armarCatalogos(
  leerCSV(`${BASE}/supabase_csv/dc_cat_modificadores.csv`).map(r=>({...r,activo:r.activo==='true'})),
  leerCSV(`${BASE}/supabase_csv/dc_cat_productos.csv`).map(r=>({...r,activo:r.activo==='true'}))
    .map(r=>r.producto==='Servicio a Dom.'?{...r,familia:'Servicio a domicilio'}:r));
function matriz(r){const wb=XLSX.readFile(r,{raw:true,cellDates:false});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});}

const matVentas = matriz(`${BASE}/entrada/ventas/ventas.xlsx`);
const dias = new Map();
for(const a of [2023,2024,2025,2026]){
  const r=procesar({matrizProductos:matriz(`${BASE}/entrada/productos/productos_${a}.xlsx`),
                    matrizVentas:matVentas, catalogos:cat});
  if(r.error){console.error(r.error);process.exit(1);}
  for(const m of r.meses) for(const d of m.dia) dias.set(d.fecha, d);
}

const esp = leerCSV(`${BASE}/supabase_csv/dc_ventas_dia.csv`);
const n = x => Math.round(x*100)/100;
let fallas=0;
const ok=(b,t)=>{console.log(`  ${b?'✓':'✗'} ${t}`); if(!b)fallas++;};

console.log(`Días producidos: ${dias.size} · esperados: ${esp.length}\n`);
ok(dias.size===esp.length, `mismo número de días`);

const campos=['ingresos_productos','ingreso_envio','unidades','piezas','renglones'];
const difs={}, muestra={};
let sinPareja=0;
for(const e of esp){
  const o=dias.get(e.fecha);
  if(!o){sinPareja++;continue;}
  for(const c of campos){
    const x=n(+o[c]||0), y=n(+e[c]||0);
    if(x!==y){
      difs[c]=(difs[c]||0)+1;
      if(!muestra[c]) muestra[c]=`${e.fecha}: obtenido ${x}, esperado ${y}`;
    }
  }
}
ok(sinPareja===0, `todos los días tienen pareja (${sinPareja} sin pareja)`);
for(const c of campos){
  ok(!difs[c], `${c}${difs[c]?`: ${difs[c]} días distintos — ${muestra[c]}`:''}`);
}
const suma=(m,c)=>n([...m.values()].reduce((s,d)=>s+(+d[c]||0),0));
const sumaE=(a,c)=>n(a.reduce((s,d)=>s+(+d[c]||0),0));
console.log('\nTotales');
for(const c of campos) ok(suma(dias,c)===sumaE(esp,c),
  `${c}: ${suma(dias,c).toLocaleString('es-MX')} vs ${sumaE(esp,c).toLocaleString('es-MX')}`);
console.log(fallas? `\n✗ ${fallas} fallas` : '\n✓ el grano diario reproduce el histórico');
process.exit(fallas?1:0);

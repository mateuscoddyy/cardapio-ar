/*
  escala-glb.js — corrige o tamanho real de um .glb para AR.

  Geradores de 3D normalizam a malha e o resultado sai em unidades
  arbitrarias. Em AR, 1 unidade = 1 metro, entao um prato costuma
  materializar com 1 a 5 metros e ocupar a mesa inteira.

  Este script mede a cena EM ESPACO DE MUNDO — percorrendo a
  hierarquia e aplicando a matriz de cada no — e entao embrulha tudo
  num no pai com a escala necessaria. Medir apenas os accessors da
  malha da o numero errado sempre que existir transformacao de no,
  que e o caso do Tripo.

  uso:  node ferramentas/escala-glb.js modelos/prato.glb 30
        (30 = maior lado horizontal real, em cm)
*/

const fs = require('fs');

const arquivo = process.argv[2];
const alvoCm  = parseFloat(process.argv[3]);

if (!arquivo || !alvoCm) {
  console.error('uso: node ferramentas/escala-glb.js <arquivo.glb> <largura-real-cm>');
  process.exit(1);
}

const buf     = fs.readFileSync(arquivo);
if (buf.slice(0, 4).toString() !== 'glTF') {
  console.error('nao e um .glb valido');
  process.exit(1);
}
const jsonLen = buf.readUInt32LE(12);
const json    = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const resto   = buf.slice(20 + jsonLen);   // chunk BIN, intocado

/* ---------- algebra de matrizes 4x4 (column-major, como no glTF) ---------- */

const identidade = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

function multiplicar(a, b) {
  const r = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let l = 0; l < 4; l++) {
      r[c * 4 + l] = a[l] * b[c * 4] + a[4 + l] * b[c * 4 + 1]
                   + a[8 + l] * b[c * 4 + 2] + a[12 + l] * b[c * 4 + 3];
    }
  }
  return r;
}

// monta a matriz de um no a partir de matrix, ou de translation/rotation/scale
function matrizDoNo(no) {
  if (no.matrix) return no.matrix.slice();

  const [tx, ty, tz] = no.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = no.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = no.scale || [1, 1, 1];

  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx,       (xz - wy) * sx,       0,
    (xy - wz) * sy,       (1 - (xx + zz)) * sy, (yz + wx) * sy,       0,
    (xz + wy) * sz,       (yz - wx) * sz,       (1 - (xx + yy)) * sz, 0,
    tx,                   ty,                   tz,                   1
  ];
}

function transformar(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

/* ---------- bounding box em espaco de mundo ---------- */

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];

function visitar(indice, pai) {
  const no = json.nodes[indice];
  const m  = multiplicar(pai, matrizDoNo(no));

  if (no.mesh != null) {
    for (const prim of json.meshes[no.mesh].primitives) {
      const a = json.accessors[prim.attributes.POSITION];
      if (!a.min || !a.max) continue;
      // os 8 cantos da caixa local, levados para o mundo
      for (let i = 0; i < 8; i++) {
        const canto = [
          (i & 1) ? a.max[0] : a.min[0],
          (i & 2) ? a.max[1] : a.min[1],
          (i & 4) ? a.max[2] : a.min[2]
        ];
        const p = transformar(m, canto);
        for (let k = 0; k < 3; k++) {
          if (p[k] < min[k]) min[k] = p[k];
          if (p[k] > max[k]) max[k] = p[k];
        }
      }
    }
  }

  for (const filho of no.children || []) visitar(filho, m);
}

const cena = json.scenes[json.scene || 0];
for (const raiz of cena.nodes) visitar(raiz, identidade());

const dim = max.map((v, i) => v - min[i]);
const maiorHorizontal = Math.max(dim[0], dim[2]);   // X e Z; Y e altura

if (!isFinite(maiorHorizontal) || maiorHorizontal === 0) {
  console.error('nao foi possivel medir a cena');
  process.exit(1);
}

const fator = (alvoCm / 100) / maiorHorizontal;

/* ---------- embrulha a cena num no com a escala ---------- */

const filhos = cena.nodes.slice();
json.nodes.push({ name: 'escala-real', scale: [fator, fator, fator], children: filhos });
cena.nodes = [json.nodes.length - 1];

let novoJson = Buffer.from(JSON.stringify(json), 'utf8');
if (novoJson.length % 4) {
  novoJson = Buffer.concat([novoJson, Buffer.alloc(4 - (novoJson.length % 4), 0x20)]);
}

const cabecalho = Buffer.alloc(12);
cabecalho.write('glTF', 0);
cabecalho.writeUInt32LE(2, 4);
cabecalho.writeUInt32LE(12 + 8 + novoJson.length + resto.length, 8);

const jsonHdr = Buffer.alloc(8);
jsonHdr.writeUInt32LE(novoJson.length, 0);
jsonHdr.write('JSON', 4);

fs.writeFileSync(arquivo, Buffer.concat([cabecalho, jsonHdr, novoJson, resto]));

const cm = (v) => (v * 100).toFixed(1);
console.log(`antes:  ${dim.map(cm).join(' x ')} cm`);
console.log(`depois: ${dim.map(v => cm(v * fator)).join(' x ')} cm`);
console.log(`fator:  ${fator.toFixed(5)}`);

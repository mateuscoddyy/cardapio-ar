/*
  escala-glb.js — corrige o tamanho real de um .glb para AR.

  Geradores de 3D normalizam a malha para caber num cubo de 1x1x1.
  Em AR, 1 unidade = 1 metro, então o prato materializa com 1 metro
  de largura e ocupa a mesa inteira. Este script embrulha a cena num
  nó pai com escala, de forma que o maior lado horizontal passe a
  medir o tamanho informado em centímetros.

  uso:  node ferramentas/escala-glb.js modelos/prato.glb 30
        (30 = largura real do prato, em cm)
*/

const fs = require('fs');

const arquivo = process.argv[2];
const alvoCm  = parseFloat(process.argv[3]);

if (!arquivo || !alvoCm) {
  console.error('uso: node ferramentas/escala-glb.js <arquivo.glb> <largura-real-cm>');
  process.exit(1);
}

const buf     = fs.readFileSync(arquivo);
const jsonLen = buf.readUInt32LE(12);
const json    = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const resto   = buf.slice(20 + jsonLen);   // chunk BIN, intocado

// tamanho atual, a partir dos limites declarados nos accessors
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];

for (const m of json.meshes || []) {
  for (const p of m.primitives) {
    const a = json.accessors[p.attributes.POSITION];
    if (!a.min) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], a.min[i]);
      max[i] = Math.max(max[i], a.max[i]);
    }
  }
}

const dim = max.map((v, i) => v - min[i]);
const maiorHorizontal = Math.max(dim[0], dim[2]);   // X e Z; Y é altura

if (!isFinite(maiorHorizontal) || maiorHorizontal === 0) {
  console.error('nao foi possivel medir a malha (accessors sem min/max)');
  process.exit(1);
}

const fator = (alvoCm / 100) / maiorHorizontal;

// Embrulha as raizes da cena num no pai com a escala.
// Mais seguro que mexer no TRS de cada raiz, que pode ja ter matriz propria.
const cena     = json.scenes[json.scene || 0];
const filhos   = cena.nodes.slice();
const novoNo   = { name: 'escala-real', scale: [fator, fator, fator], children: filhos };
json.nodes.push(novoNo);
cena.nodes = [json.nodes.length - 1];

// re-serializa o chunk JSON com padding de 4 bytes (espacos)
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

const cm = (v) => (v * fator * 100).toFixed(1);
console.log(`antes:  ${dim.map(v => (v * 100).toFixed(1)).join(' x ')} cm`);
console.log(`depois: ${cm(dim[0])} x ${cm(dim[1])} x ${cm(dim[2])} cm`);
console.log(`fator:  ${fator.toFixed(4)}`);

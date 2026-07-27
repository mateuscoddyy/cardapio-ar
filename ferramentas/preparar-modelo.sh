#!/usr/bin/env bash
# preparar-modelo.sh — leva um .glb cru de gerador 3D ao estado publicável.
#
#   uso: ferramentas/preparar-modelo.sh <bruto.glb> <saida.glb> [cm]
#
# O bruto do Tripo sai com ~55 MB, 1,8 M de triângulos, três texturas
# 4096 e escala arbitrária. Publicado assim ele estoura a memória de
# vídeo do celular e a tela fica vazia, sem erro nenhum.
#
# Ordem dos passos importa:
#   1. simplificar geometria (a tolerância de erro trava em ~390 mil)
#   2. reduzir só normal e metallic/roughness — baseColor fica em 4096,
#      é o único mapa que se enxerga
#   3. Draco POR ÚLTIMO: o passo resize descarta a compressão
#   4. escala real, medida em espaço de mundo
#
# Padrões ancorados de propósito: "*ORM*" casaria com "N-orm-alGL".

set -euo pipefail

BRUTO="${1:?informe o .glb de entrada}"
SAIDA="${2:?informe o .glb de saida}"
CM="${3:-30}"

GT="./node_modules/.bin/gltf-transform"
TMP="$(dirname "$SAIDA")/.prep-$$"

echo "1/4 simplificando geometria..."
"$GT" optimize "$BRUTO" "$TMP-a.glb" \
  --compress false --simplify-ratio 0.05 \
  --texture-size 4096 --texture-compress auto >/dev/null

echo "2/4 reduzindo normal e metallic/roughness..."
"$GT" resize "$TMP-a.glb" "$TMP-b.glb" --pattern "NormalGL_*" --width 2048 --height 2048 >/dev/null
"$GT" resize "$TMP-b.glb" "$TMP-c.glb" --pattern "ORM_*"      --width 1024 --height 1024 >/dev/null

echo "3/4 comprimindo com Draco..."
"$GT" draco "$TMP-c.glb" "$SAIDA" >/dev/null

echo "4/4 ajustando escala para ${CM} cm..."
node ferramentas/escala-glb.js "$SAIDA" "$CM"

rm -f "$TMP-a.glb" "$TMP-b.glb" "$TMP-c.glb"

TAM=$(node -e "console.log((require('fs').statSync(process.argv[1]).size/1048576).toFixed(2))" "$SAIDA")
echo "pronto: $SAIDA — ${TAM} MB"

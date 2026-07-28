# Cardápio-AR — contexto do projeto

Página de cardápio em realidade aumentada que o **Mateus Eleuterio** vende para
restaurantes da região de Itajaí / Praia Brava (SC). O cliente escaneia um QR na
mesa, vê o prato em 3D e coloca ele em cima da própria mesa, no tamanho real,
sem instalar aplicativo.

- Pasta: `C:\Users\a\Desktop\Catalogo vivo`
- Repo: `github.com/mateuscoddyy/cardapio-ar`
- No ar: **https://mateuscoddyy.github.io/cardapio-ar/**
- Pages publica de `main`, raiz. **Todo push para `main` vai ao ar em ~1 min.**

> **Não criar nada em `C:\Users\a\Desktop\RC\CatalogoRC`.** É outro projeto do
> Mateus e ele pediu explicitamente para não misturar os dois.

---

## Estado atual

Primeira demonstração comercial, feita para o **Aspas Restaurante** (Praia Brava,
Itajaí — cozinha brasileira na brasa, frutos do mar, 43 mil seguidores). Ainda
**não autorizada** por eles.

Quatro pratos funcionando em AR, todos com nome, descrição e preço reais tirados
do cardápio que o próprio restaurante publica:

| Prato | Preço | Modelo | Tamanho real |
|---|---|---|---|
| Tiradito de peixe branco maçaricado | R$ 86 | `aspas-peixe.glb` | 30 cm |
| Camarão rosa G no espeto | R$ 159 | `aspas-camarao.glb` | 32 cm |
| Parmegiana de meka | R$ 290 | `aspas-parmegiana.glb` | 34 cm |
| Couve-flor na brasa | R$ 69 | `aspas-couveflor.glb` | 24 cm |

O rodapé assina "Mateus Eleuterio" e leva ao WhatsApp **47 99917-1043**
(`5547999171043`) — já testado e funcionando.

### Pendências

- **Sobremesa** — pedida pelo Mateus, mas não existe foto de nenhuma no site do
  Aspas. Só entra com foto tirada por ele.
- **Vídeo do preparo** — a seção "Como é feito" está pronta e **oculta**;
  aparece sozinha quando `CONFIG.video` apontar para um mp4. Pedir o arquivo
  bruto ao restaurante (WhatsApp deles: **47 99740-2006**).
- **Logo do prato borrado** — o logo "Aspas" gravado na louça sai ilegível no
  3D. Não tem conserto por software (ver limitações abaixo). O Mateus já sabe e
  decidiu deixar para depois.
- **QR code** para a mesa ainda não foi gerado.

---

## Como mexer na página

`index.html` é um arquivo único, sem build. Todo o conteúdo mora no objeto
`CONFIG`, no topo do `<script>`:

```js
brand, place        // marca e cidade
hero                // foto de abertura
logo                // PNG claro com transparência; vazio = nome em texto
demoNote            // faixa de aviso no topo; vazio = some
video, videoPoster  // vazio = a seção "Como é feito" fica oculta
studio, whatsapp, pitch   // assinatura e contato do rodapé
items[]             // name, price, desc, fonte, glb, usdz, pending
```

Trocar de cliente é trocar esse bloco e os arquivos em `marca/`, `imagens/` e
`modelos/`. Nada abaixo do CONFIG precisa ser tocado.

**Item com `pending: true`** aparece na lista como "em produção", desabilitado —
serve para prato sem modelo ainda, sem fingir que existe.

### Direção visual

Vem do manifesto do próprio Aspas: *"Aspas é brasa"* e *"Simples assim"*.

- Fundo carvão (`#0C0A09`, preto quente) e brasa (`#E2551D`) — duas temperaturas
  e nada mais.
- Abertura na foto da grelha deles, que se apaga num gradiente e vira o fundo da
  página. A página conta uma frase: começa no fogo, termina no prato.
- Tipografia: **Fraunces** com eixo `WONK` (ecoa o logo manuscrito) no display,
  **Schibsted Grotesk** no corpo, **JetBrains Mono** nos rótulos.
- Um único momento de animação: a brasa sob o prato acende quando ele entra na
  tela, via `IntersectionObserver`. Evitar espalhar mais efeitos.

---

## Pipeline dos modelos 3D

```bash
npm install --no-save sharp @gltf-transform/cli
bash ferramentas/preparar-modelo.sh <bruto.glb> <saida.glb> <cm>
```

O script faz os quatro passos na ordem certa. **A ordem importa** — ver
armadilhas abaixo.

### Geração

Higgsfield, modelo `tripo_h3_1_image_to_3d` com `texture_quality` e
`geometry_quality` em `detailed` — **18 créditos**. Sai com ~55 MB, 1,8 M de
triângulos e três texturas 4096.

Custos medidos com `get_cost: true` (não estimados):

| Operação | Créditos |
|---|---|
| `sam_3_3d` — 1 imagem → GLB | 1 |
| `tripo_h3_1_image_to_3d` padrão | 9 |
| `tripo_h3_1_image_to_3d` detailed | **18** |
| `image_to_3d` (Meshy) | 30 |
| `nano_banana_pro` — editar imagem | 2 |
| `outpaint_image` — expandir imagem | 2 |
| `kling3_0_turbo` — vídeo 5s | 7,5 |

`sam_3_3d` custa 1 crédito mas entrega textura 1024 e ~10 mil triângulos: fica
visivelmente "144p" num prato. Serve para teste, não para entrega.

### Armadilhas que já custaram caro

1. **VRAM, não tamanho de arquivo.** Uma textura 4096² custa ~85 MB de memória
   de GPU depois de descomprimida, mesmo o JPEG tendo 1,6 MB. Três delas mais
   uma malha de 1,8 M de triângulos deram **321 MB** e derrubaram o WebGL no
   celular: tela vazia, sem erro, arquivo íntegro. Teto seguro: **~120 MB**.
   Receita: `baseColor` 4096 (único mapa que se enxerga), `normal` 2048,
   `metallicRoughness` 1024, malha ~390 mil triângulos.

2. **Draco por último.** O passo `resize` do gltf-transform **descarta** a
   compressão. Comprimir antes de redimensionar dá arquivo 4x maior.

3. **Padrões de textura ancorados.** `--pattern "*ORM*"` casa com `NormalGL`,
   porque "orm" está dentro de "N-**orm**-al". Usar `ORM_*` e `NormalGL_*`.

4. **Escala em espaço de mundo.** Geradores normalizam a malha, e em AR 1
   unidade = 1 metro — o prato materializa com 1 a 5 metros. Medir só o
   `min`/`max` dos accessors **dá errado**: o Tripo aplica transformação no nó
   raiz, e uma malha que media 0,98 tinha 5,1 m de cena. `escala-glb.js`
   percorre a hierarquia aplicando as matrizes. Conferir com
   `gltf-transform inspect`, que mostra o bbox real.

5. **Diagnóstico.** Visualizador vazio = memória ou decodificador Draco. Prato
   torto = modelo. São coisas diferentes.

---

## Limitações reais (não são bugs)

- **O gerador reproduz só o que está na foto.** Mão, talher, tigela ao lado —
  tudo vira geometria. A saída é editar a imagem antes: `nano_banana_pro` para
  apagar objetos, `outpaint_image` quando o prato sai do quadro.
- **Vista única.** Todos esses modelos inventam a face que a câmera não viu.
  Sempre girar antes de entregar.
- **Textura tem teto na foto.** O logo gravado na louça ocupa ~110×60 px na foto
  original e já é ilegível ali. Nenhuma textura 4096, triângulo a mais ou
  crédito recupera o que a câmera não registrou. Upscale por IA deixaria nítido,
  mas com **letras inventadas** — inaceitável para a marca de um cliente.
- **Fonte pequena não se salva.** O ancho foi removido: única foto com 853 px e
  35% de brilho, ~300 px úteis na carne, sem versão maior no site.
- **Pixels reconstruídos.** Na parmegiana, couve-flor e camarão, o entorno e
  parte da borda do prato foram gerados por IA ao apagar mãos e completar o
  enquadramento. A comida é a deles; o entorno não é. O Mateus está ciente.

Tudo isso desaparece com foto tirada no restaurante. **É a recomendação
principal**: uma volta de 15 minutos com celular resolve resolução, logo, verso
inventado e sobremesa de uma vez.

---

## Fontes públicas do Aspas (nenhuma exige login)

- `restauranteaspas.com` — 16 imagens em alta e o **logo em PNG com alpha**.
  `ASPAS-102` foi a única foto com prato inteiro e isolado sem edição.
- `linktr.ee/aspasrestaurante` → **cardápio completo em PDF** no Google Drive
  (id `1T6kGgG1drhO9tAcm32MFKNNRAzKQswL_`), carta de vinhos, e o WhatsApp deles.
  É de lá que vêm todos os preços — **nada na página é inventado**.
- **Instagram e Reels não são acessíveis** sem login; só a meta tag pública.
  Para o vídeo do preparo, pedir o arquivo ao restaurante. O embed oficial
  funciona, mas traz a moldura branca do Instagram e quebra o design escuro.

Ler PDF: `npm install --no-save pdfjs-dist` e extrair texto por página.

---

## Preferências do Mateus

- **Créditos são finitos.** Ele gastou 600 de 1000 em 4 vídeos ruins no
  Higgsfield e **não pretende renovar**. Sempre preflightar com
  `get_cost: true` e mostrar o número antes de gerar.
- Prefere a alternativa gratuita quando ela empata ou ganha. Para prato real,
  filmar no celular e escanear com **Scaniverse** (grátis, exporta GLB) vence a
  IA — e resolve o verso inventado.
- Não usar IA de vídeo para preparo de comida: é onde ele já se queimou.

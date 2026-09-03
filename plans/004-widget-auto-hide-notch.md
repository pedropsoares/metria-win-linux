# Plan 004: Auto-hide real do widget (notch) no Windows/Linux

## Status

- **Priority**: P2
- **Effort**: M (uma máquina de estados no main + geometria nova testável)
- **Risk**: MEDIUM (mexe no único ponto de passagem dos bounds do widget e já
  houve um revert nessa área — `941b788`)
- **Depends on**: nada
- **Category**: feature
- **Planned at**: commit `ca8a5d2`, 2026-09-03
- **Revised at**: 2026-09-03, depois de comparar o resultado com o notch nativo
  de macOS. A revisão está registrada em "Revisão pós-implementação".

## Context

No app nativo de macOS o notch se esconde sozinho e só reaparece quando o cursor
chega perto da borda. Nesta porta Electron o widget fica sempre colado na borda,
ocupando espaço e roubando cliques.

A configuração já existe pela metade: `widgetBehavior: "pinned" | "auto-hide"`
está persistida em [settings.ts:44](src/main/settings.ts#L44), tipada em
[types.ts](src/shared/types.ts) e exposta na UI em
[index.tsx:315](src/renderer/index.tsx#L315) — mas **o processo principal nunca a
lê**. O único efeito hoje é cosmético, no renderer: opacidade 0.55 e um chevron
em [widget.tsx:123-124](src/renderer/widget.tsx#L123-L124).

Já houve uma tentativa de colapso só no renderer, revertida no commit `941b788`
com o comentário: *"Keep provider items mounted while auto-hide is active so the
rail remains discoverable and can recover even when a window manager misses hover
events."* Ou seja: **hover só via DOM não é confiável** em janela transparente
always-on-top, e o widget ficava preso escondido.

**Resultado esperado:** com `widgetBehavior === "auto-hide"`, o widget recolhe
até uma pílula curta colada na borda, libera a área da tela que ocupava, e
desliza de volta quando o cursor encosta nela — sem regredir drag, card de
hover, menu de contexto nem as demais preferências.

## Decisões já tomadas com o usuário

| Decisão | Escolha |
| --- | --- |
| Aparência escondida | Pílula curta na borda, com chevron, sempre visível |
| Padrão | Continua `pinned`; auto-hide segue opt-in em Settings › Display › Behavior |
| Área do widget escondida | Não bloqueia a janela de baixo |

## Abordagem

Tirar a máquina de estados do renderer e colocá-la no **processo principal**,
espelhando o padrão já existente e testado de `showCard`/`hideCard`/
`scheduleCardHide`.

**A janela encolhe para a pílula em vez de virar click-through.** A alternativa
de manter o rect cheio com `setIgnoreMouseEvents(true, { forward: true })` não se
sustenta no Linux: `forward` é `@platform darwin,win32`
([electron.d.ts:20661-20668](node_modules/electron/electron.d.ts#L20661-L20668)),
então no Linux a janela recolhida não receberia evento de mouse nenhum, e a única
saída seria `screen.getCursorScreenPoint()`, que sob Wayland não reporta posição
global confiável — o widget ficaria inalcançável. Encolher o rect resolve isso de
forma nativa: a área liberada não tem janela nenhuma por cima, então os cliques
"passam" por definição, e o hover na pílula funciona por DOM em qualquer
plataforma.

**A animação, porém, é do conteúdo — não da janela.** O painel do macOS nunca
muda de tamanho ([MetriaApp.swift:2614](../metria/apps/macos-native/Sources/Metria/MetriaApp.swift#L2614));
o esconder/revelar é uma spring do SwiftUI sobre o conteúdo, e o clique passa por
baixo via `hitTest` por pixel. Aqui a janela precisa encolher, mas ela é
redimensionada **uma vez por transição**, com o slide feito por `transform` em
CSS no renderer. Redimensionar uma janela transparente `alwaysOnTop` a cada 16 ms
é a operação mais cara possível sob o DWM e sob a maioria dos compositores Linux,
e foi o que fez o slide da primeira versão gaguejar.

Estados:

1. **Recolhido** — bounds = pílula de `WIDGET_COLLAPSED_THICKNESS` ×
   `WIDGET_PEEK_EXTENT`, centrada na extensão do rail e colada na borda (espelha
   o `hiddenWidth`/`hiddenHeight` de 18×80 pt do macOS). No **win32** a janela
   também recebe `setIgnoreMouseEvents(true, { forward: true })`, para que a
   pílula não roube cliques e ainda assim entregue `mousemove`/`mouseleave` ao
   renderer. No **linux** fica clicável mesmo (sem `forward` não haveria hover),
   o que é aceitável numa pílula de 14×80.
2. **Revelado** — bounds = rect cheio do `widgetBounds()`,
   `setIgnoreMouseEvents(false)`, superfície entra com `transform` + opacidade no
   renderer.
3. **Transição** — a janela vai para o rect cheio **antes** do slide de entrada e
   só encolhe `WIDGET_SLIDE_MS` **depois** do slide de saída, de modo que o
   conteúdo nunca é cortado pela borda da janela.
4. **Gatilhos** — revelar: `mouseenter`/`mousemove` na pílula (DOM) **ou** o
   cursor entrar na hot zone detectado por poll de `screen.getCursorScreenPoint()`
   (~100 ms), que roda só com auto-hide ligado, ambos passando por um dwell de
   `WIDGET_REVEAL_DWELL_MS` para que apenas roçar a borda não abra o widget. Os
   dois caminhos são redundantes de propósito: é o que impede o bug que causou o
   revert do `941b788`. Recolher: debounce de `WIDGET_COLLAPSE_DELAY_MS` depois
   de o cursor sair da união **inflada** de `bounds(widget) ∪ bounds(card)`.
5. **Sem `settings.load()` por tick** — os rects (expandido, recolhido, hot zone)
   ficam em cache de módulo, recalculados em `updateWidgetBounds`,
   `recreateWidget` e na troca de preferências.

## Arquivos e mudanças

### `src/main/widget-geometry.ts` (novo — geometria pura, testável)

`src/main/index.ts` não tem teste; os testes em `src/test/` só cobrem funções
puras. Extrair a geometria permite testar sem mockar Electron.

```ts
export interface Rect { x: number; y: number; width: number; height: number }

/** Pílula curta colada na borda, centrada na extensão do widget. */
export function collapsedWidgetBounds(expanded: Rect, position: WidgetPosition, thickness: number, peekExtent: number): Rect

/** Faixa sensível ao cursor: a pílula crescida em todo lado que não é a borda. */
export function autoHideHotZone(collapsed: Rect, position: WidgetPosition, grab: number): Rect

/** Cresce um rect em todos os lados — usado para costurar o vão widget↔card. */
export function inflateRect(rect: Rect, margin: number): Rect

export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean
export function pointInAnyRect(point: { x: number; y: number }, rects: (Rect | undefined)[]): boolean
```

Constantes em [types.ts](src/shared/types.ts), junto de `WIDGET_ITEM_HEIGHT`:
`WIDGET_COLLAPSED_THICKNESS = 14`, `WIDGET_PEEK_EXTENT = 80`,
`WIDGET_HOT_ZONE_GRAB = 6`, `WIDGET_COLLAPSE_DELAY_MS = 250`,
`WIDGET_REVEAL_DWELL_MS = 100`, `WIDGET_KEEP_OPEN_MARGIN = 12`,
`WIDGET_CURSOR_POLL_MS = 100`, `WIDGET_SLIDE_MS = 160`.

`WIDGET_KEEP_OPEN_MARGIN` **precisa ser ≥ `CARD_SPACING`**, senão atravessar o
vão entre widget e card conta como sair e recolhe no meio da interação.

### `src/main/index.ts`

- Estado de módulo junto de `cardActiveIndex`/`pendingCardHide`:
  `widgetRevealed`, `pendingWidgetCollapse`, `pendingWidgetReveal`,
  `pendingWidgetShrink`, `cursorPollTimer`, `cachedExpanded/Collapsed/HotZone`.
- `autoHideEnabled()` — lê `widgetBehavior`; chamada fora do loop de poll.
- `resetWidgetAutoHide()` — limpa todos os timers. **Obrigatório antes de
  destruir a janela**: um shrink ou reveal pendente aplicaria a geometria da
  janela antiga na janela nova.
- `revealWidget()` / `collapseWidget()` — um `setBounds` por transição, alternam
  `setIgnoreMouseEvents` (só win32), mandam `metria:widget-reveal` /
  `metria:widget-collapse`; `collapseWidget()` também chama `hideCard()`.
- `scheduleWidgetCollapse()` / `scheduleWidgetReveal()` + seus `cancel`, e
  `setWidgetPointerInside(inside)` como **único ponto de decisão** dos dois
  gatilhos.
- `widgetKeepOpenRects()` — hot zone ∪ widget inflado (quando revelado) ∪ card
  inflado. Testar só a hot zone recolhia o widget embaixo do cursor parado sobre
  um provider.
- `startCursorPoll()` / `stopCursorPoll()`. Param com `showWidget: false`, ao
  voltar para `pinned`, no `closed` da janela e em `quitApp()`.
- `updateWidgetBounds()` — recalcula os três rects em cache e aplica o rect certo
  conforme o estado; mantém o rect expandido enquanto `pendingWidgetShrink` está
  em voo, senão um refresh de usage corta a animação.
- `recreateWidget()` — `resetWidgetAutoHide()` antes de destruir; com auto-hide
  ligado a janela já nasce recolhida.
- `createWidgetWindow()` — manda o estado inicial no `did-finish-load`, para o
  widget não pintar o rail cheio por um frame antes da primeira query de
  settings.
- `metria:widget-hover-state` (com `requireTrustedSender`): o renderer informa
  entrada/saída do ponteiro, como caminho redundante ao poll.
- `metria:set-widget-y-offset` usa o rect **expandido em cache** para clampear,
  senão arrastar logo após revelar clampeia contra a espessura da pílula.

### `src/preload/index.ts` + `src/shared/types.ts` (`MetriaApi`)

`onWidgetReveal(cb)`, `onWidgetCollapse(cb)` e `setWidgetHoverState(hovered)`, no
mesmo formato de `onCardShow`/`onCardHide`.

### `src/renderer/widget.tsx`

- `revealed` vem do main via `onWidgetReveal`/`onWidgetCollapse`. O hover do DOM
  vira reforço, chamando `setWidgetHoverState`.
- **Hover e drag ficam num wrapper**, não na superfície: enquanto recolhida, a
  superfície está transladada para fora do viewport, e a pílula ainda precisa
  receber o `mouseenter` que respalda o poll do main.
- Superfície (`<main>`) desliza com `transform: translate3d(±100%)` +
  `transition` de `WIDGET_SLIDE_MS`, e a pílula (`<span>`) — ancorada na borda,
  centrada, com `min(WIDGET_PEEK_EXTENT, 100%)` — faz cross-fade com ela.
- `PeekChevron` aponta a direção do reveal, espelhando o
  `hiddenHintSymbolName` do macOS.
- `opacity` volta a ser só `widgetOpacity` — a preferência do usuário não é mais
  multiplicada pelo estado de hover.
- Manter `displayed = visible` (conteúdo sempre montado), respeitando a lição do
  `941b788`.
- Suprimir o collapse durante o drag.

### `src/renderer/index.tsx`

Só o rótulo do `<select>` de Behavior: "Auto-hide (slides out on hover)".

## O que NÃO pode regredir

- Arrastar o widget ao longo da borda (`setWidgetYOffset`, `DRAG_THRESHOLD`).
- Card de hover por provider, inclusive permanecer aberto com o cursor sobre o
  card.
- Menu de contexto (botão direito) e clique abrindo o dashboard.
- `widgetOpacity`, `widgetSize`, `widgetPosition` (4 bordas), `widgetDisplayId`.
- Modo `pinned` idêntico ao de hoje, sem poll de cursor rodando.

## Revisão pós-implementação

A primeira versão passou no `npm run check` mas ficou bem pior de usar que o
notch nativo. Três causas, todas corrigidas acima:

1. **O widget recolhia embaixo do cursor.** A união do poll era só
   `hot zone ∪ card`, e a hot zone tinha ~14 px. Com o widget revelado (88 px), o
   cursor sobre um ícone ficava fora dela; o poll agendava o collapse e nada
   cancelava, porque o `<main>` também tinha perdido o `onMouseMove`. Resultado:
   o widget se fechava sozinho depois de 400 ms de hover, levando o card junto.
   Corrigido por `widgetKeepOpenRects()`.
2. **A animação era um tween de `setBounds` a cada 16 ms.** Nove resizes de
   janela transparente always-on-top por transição, com o React relayoutando
   dentro de um viewport que mudava de tamanho a cada frame. Substituído por um
   `setBounds` por transição + `transform` em CSS.
3. **A pílula tinha a extensão inteira do rail.** Ruído visual, e no Linux uma
   tira clicável de ponta a ponta na borda, engolindo cliques na barra de
   rolagem de qualquer janela maximizada. Substituída pelo peek curto do macOS.

Também ficaram para trás dois vazamentos: `recreateWidget()` e o handler `closed`
não cancelavam o tween em voo, então trocar posição/tamanho no meio de um slide
aplicava a geometria antiga na janela nova.

## Verificação

1. `npm run check` (typecheck + build + testes) — obrigatório antes de rodar o
   app.
2. Testes em `src/test/widget-geometry.test.ts` (`node --test`):
   `collapsedWidgetBounds` nas 4 posições e com um rail menor que o peek,
   `autoHideHotZone` nas 4 posições, `inflateRect` costurando o vão do card,
   `pointInRect` nas bordas, `pointInAnyRect` com o card.
3. Manual, com `npm run dev`:
   - Ligar auto-hide em Settings › Display › Behavior → widget recolhe pra
     pílula com chevron.
   - Encostar o cursor na pílula → desliza pra fora; afastar → recolhe após
     ~250 ms. Passar rápido pela borda → **não** abre.
   - **Parar o cursor sobre um provider por vários segundos → não recolhe.**
   - **Mover o cursor do widget para o card → o widget continua aberto.**
   - Clicar/rolar numa janela na área que o widget ocupava → chega na janela de
     baixo.
   - Arrastar o widget revelado ao longo da borda → posição persiste e o
     auto-hide volta a funcionar na posição nova.
   - Trocar `widgetPosition` para top/bottom/left → pílula, chevron e reveal
     corretos.
   - **Trocar posição/tamanho no meio de um slide → nenhuma janela fantasma.**
   - Voltar para `pinned` → widget fixo, sem poll.
   - Reiniciar o app com auto-hide ligado → nasce recolhido, sem flash do rail.
   - Segundo monitor via `widgetDisplayId` → pílula na borda do monitor certo.

## Notas de risco

- Sob **Wayland**, `getCursorScreenPoint()` pode não reportar posição global. O
  caminho DOM (pílula clicável no Linux) cobre esse caso sozinho — é por isso
  que os dois gatilhos existem.
- Durante os `WIDGET_SLIDE_MS` do slide de saída a janela ainda está expandida e,
  no Linux, ainda clicável. É a mesma janela de tempo que permite ao usuário
  "pegar" o widget de volta se mudar de ideia.
- O poll de 100 ms só roda com auto-hide ligado e não toca em disco (rects em
  cache), então o custo é desprezível.

# SPEC 01 — Cuatro fantasmas con personalidad propia

> **Status:** Aprobado
> **Depends on:** Ninguna
> **Date:** 2026-11-10
> **Objective:** Dotar al juego de cuatro fantasmas con comportamientos distintos —incluido un cazador agresivo que usa la ruta más corta— y una salida escalonada del pen.

## Por qué existe esta spec

Hoy `src/js/maze.js` define dos fantasmas: `hunter` y `random`. `decideGhost()` en `src/js/game.js` solo distingue entre perseguir con distancia Manhattan y moverse al azar. El juego se siente plano: no hay roles ni presión coordinada. Esta spec sustituye esos dos fantasmas por cuatro roles fijos inspirados en el arcade original. No añade modos de juego nuevos.

## Scope

**In:**

- Cuatro fantasmas fijos: `chaser` (rojo), `ambusher` (rosa), `flanker` (cian) y `shy` (naranja).
- Cuatro posiciones de inicio dentro del pen en `GHOST_STARTS`.
- Salida escalonada del pen: 0, 90, 180 y 270 frames (~0, 1.5, 3 y 4.5 s a 60 fps).
- `chaser` a 0.125 celda/frame; los otros tres a 0.1.
- Persecución del `chaser` con BFS sobre la cuadrícula. Respeta paredes, puerta y túnel.
- `ambusher`: apunta 4 celdas por delante de la dirección de Pac-Man.
- `flanker`: apunta al punto calculado con la posición del `chaser` y 2 celdas por delante de Pac-Man.
- `shy`: persigue si está a más de 8 celdas. Si no, va a la esquina inferior izquierda `(1,29)`.
- Reinicio de posiciones y temporizadores al perder una vida.
- Color por rol en `render.js`. La forma del fantasma no cambia.

**Out of scope (for future specs):**

- Power pellets y modo asustado.
- Ciclos scatter/chase por temporizador.
- Formas, antenas o etiquetas distintas por fantasma.
- Reglas de reentrada al pen distintas de la puerta transitable actual.
- Nuevos niveles, sonido, móvil o multijugador.
- Persistencia de puntuaciones o estado.

## Data model

`src/js/maze.js`:

```js
const GHOST_STARTS = [
  { x: 13, y: 13, kind: 'chaser' },
  { x: 14, y: 13, kind: 'ambusher' },
  { x: 13, y: 14, kind: 'flanker' },
  { x: 14, y: 14, kind: 'shy' },
];
```

`src/js/game.js`:

```js
const GHOST_TYPES = {
  chaser:   { speed: 0.125, releaseDelay: 0 },
  ambusher: { speed: 0.1,   releaseDelay: 90 },
  flanker:  { speed: 0.1,   releaseDelay: 180 },
  shy:      { speed: 0.1,   releaseDelay: 270 },
};
```

Cada fantasma de `game.ghosts` pasa a tener:

```js
{
  x, y,
  dir: 'up',
  speed: GHOST_TYPES[kind].speed,
  kind,
  releaseDelay: GHOST_TYPES[kind].releaseDelay,
  released: false,
}
```

`game` incorpora `elapsedFrames: 0`. Se incrementa una vez por `update()` mientras `state === 'playing'`. Es un contador de frames, no de tiempo real.

`src/js/render.js`:

```js
const GHOST_COLORS = {
  chaser:   '#ff0000',
  ambusher: '#ffb8ff',
  flanker:  '#00ffff',
  shy:      '#ffb852',
};
```

`drawGhost(ctx, g, GHOST_COLORS[g.kind] || '#ff0000')`.

Convenciones:

- Coordenadas de celda con origen arriba-izquierda. `x` en `[0,27]`, `y` en `[0,30]`.
- `0.125` alinea cada 8 frames. `0.1` alinea cada 10.
- La IA se evalúa solo en celdas alineadas (`aligned()`), igual que hoy.
- Se reutilizan `isWall()` y `canMove()`. Los fantasmas pueden cruzar la puerta (`3`). Pac-Man no.
- Las posiciones se redondean a celda para calcular objetivos.
- La celda objetivo del `chaser` es la celda redondeada de Pac-Man, recortada a los límites del laberinto.
- Los objetivos de `ambusher` y `flanker` pueden quedar fuera de la cuadrícula. Se usan tal cual para la distancia Manhattan.

## Implementation plan

1. **Cuatro inicios y configuración.** Añadir las cuatro entradas de `GHOST_STARTS` en `src/js/maze.js`. Crear `GHOST_TYPES` en `src/js/game.js` y usarlo en `createGame()` para asignar `speed`, `kind` y `releaseDelay`. Sustituye a `GHOST_SPEED`. Prueba manual: abrir `src/index.html` y ver cuatro fantasmas en el pen sin errores.
2. **Salida escalonada.** Añadir `elapsedFrames` a `game`. Incrementarlo en `update()`. Añadir `released` a cada fantasma. En `moveGhost()`, no mover al fantasma hasta que `elapsedFrames >= releaseDelay`. Mientras esté en el pen (`y` entre 12 y 15, `x` entre 11 y 16), forzar `dir = 'up'` hasta salir a `y <= 11`. Prueba manual: salen en orden con ~1.5 s de diferencia y no se pasean de lado dentro del pen.
3. **Reinicio limpio.** En `resetPositions()`, reiniciar `elapsedFrames = 0` y `released = false` de cada fantasma. También posición y dirección. Prueba manual: perder una vida y ver que vuelven al pen y repiten la salida.
4. **Helpers de decisión.** Extraer `legalDirs(game, g)`. Excluye el sentido opuesto salvo en callejones sin salida. Extraer `greedyDir(game, g, target)` con prioridad fija `up, left, down, right`. Usar `greedyDir` para el `chaser` de forma temporal. Prueba manual: el rojo persigue a Pac-Man sin atravesar paredes.
5. **BFS del cazador.** Implementar `shortestPathDir(grid, from, to, forbiddenDir)`. Usa cola, celdas visitadas y vecinos en orden de prioridad. Envuelve el túnel en la fila 14. Usarlo en `chaser`. Si no hay ruta sin el sentido opuesto, reintentar permitiéndolo. Prueba manual: el rojo llega por la ruta más corta y no entra en bucles.
6. **Emboscador.** Objetivo de `ambusher`: `celda(Pac-Man) + 4 * dirección(Pac-Man)`. Elegir con `greedyDir`. Prueba manual: el rosa se adelanta a Pac-Man cuando este corre en línea recta.
7. **Flanqueador.** Objetivo de `flanker`: `2 * (celda(Pac-Man) + 2 * dirección(Pac-Man)) - celda(chaser)`. Elegir con `greedyDir`. Prueba manual: el cian corta la diagonal desde el otro lado.
8. **Tímido.** `shy`: si la distancia Manhattan a Pac-Man es mayor que 8, perseguirlo. Si no, ir a `(1,29)`. Prueba manual: el naranja se acerca, se aleja al acercarse y vuelve a la esquina inferior izquierda.
9. **Colores por rol.** Sustituir el array `GHOST_COLORS` de `src/js/render.js` por el objeto indexado por `kind`. Pasarlo a `drawGhost`. Prueba manual: rojo, rosa, cian y naranja se corresponden con sus roles.

## Acceptance criteria

- [ ] `src/index.html` carga desde `file://` sin errores en la consola.
- [ ] Al empezar una partida hay exactamente cuatro fantasmas. Cada uno tiene un color distinto: rojo, rosa, cian y naranja.
- [ ] El `chaser` sale del pen de inmediato. Llega a la celda de Pac-Man por la ruta más corta permitida por la regla de no revertir, sin atravesar paredes ni entrar en bucles.
- [ ] El `ambusher` se dirige a la celda situada 4 posiciones por delante de la dirección actual de Pac-Man.
- [ ] El `flanker` se dirige al punto `2 * (Pac-Man + 2 * dirección) - chaser`.
- [ ] El `shy` persigue a Pac-Man cuando está a más de 8 celdas. Se dirige a `(1,29)` cuando está a 8 o menos.
- [ ] Los fantasmas inician la salida del pen a los ~0, 1.5, 3 y 4.5 s del inicio, en ese orden. No se mueven de lado dentro del pen.
- [ ] Al perder una vida, los cuatro vuelven al pen. Los temporizadores se reinician y el rojo vuelve a salir primero.
- [ ] Ningún fantasma atraviesa una pared. El túnel de la fila 14 funciona en ambos sentidos para los cuatro.
- [ ] Comer todos los dots sigue mostrando `GANASTE`. Perder las tres vidas sigue mostrando `PERDISTE`.
- [ ] Los fantasmas no cambian de forma ni muestran etiquetas. Solo se distinguen por color.

## Decisions

- **Sí:** cuatro roles fijos inspirados en el arcade (`chaser`, `ambusher`, `flanker`, `shy`). Da personalidad reconocible sin introducir modos nuevos.
- **No:** un quinto fantasma aleatorio o roles aleatorios por partida. La petición pide cuatro roles estables y verificables.
- **Sí:** BFS para el `chaser`. La distancia Manhattan puede hacer bucles. BFS cumple de verdad "persecución agresiva".
- **No:** BFS para los otros tres roles. `greedyDir` es suficiente para objetivos móviles y mantiene el código pequeño.
- **Sí:** prioridad fija `up, left, down, right` para desempates. Hace el comportamiento reproducible.
- **Sí:** se mantiene la regla de no revertir el sentido salvo en callejones sin salida. Evita giros de 180º antinaturales. El BFS la respeta y la relaja solo si no hay ruta.
- **Sí:** salida escalonada por frames (0/90/180/270). Es determinista y encaja con el movimiento, que ya es por frames.
- **No:** temporizadores por reloj real. Introducirían dependencia del refresh rate y del lag.
- **Sí:** el `chaser` a 0.125 y el resto a 0.1. El cazador se siente agresivo sin romper la alineación de cuadrícula.
- **No:** velocidades distintas por rol más allá de esa diferencia. Añadiría tuning sin respaldo en la petición.
- **Sí:** objetivos de `ambusher` y `flanker` fuera de la cuadrícula. Se usan tal cual, como en el arcade. Recortarlos cambiaría el comportamiento.
- **Sí:** colores por `kind` en `render.js`. Evita acoplar el color al orden del array.
- **No:** formas, antenas o etiquetas de rol. La petición habla de "forma de actuar", no de forma visual.
- **Sí:** extender `GHOST_STARTS` y añadir `GHOST_TYPES` en los archivos existentes. No hay ES modules. Un archivo nuevo obligaría a tocar el orden de `<script>`.
- **No:** power pellets, modo asustado y ciclos scatter/chase. Van en specs posteriores.

## Risks

| Risk | Mitigation |
| --- | --- |
| El BFS con la regla de no revertir puede no encontrar ruta en un callejón. | Reintentar permitiendo el sentido opuesto. Si aun así no hay ruta, usar `greedyDir`. |
| El `chaser` a 0.125 puede ser demasiado letal y hacer la partida injusta. | Solo él es más rápido. El resto queda a 0.1. Ajustar en una spec de dificultad si hace falta. |
| Los fantasmas se solapan en el pen o en la puerta. | Salida escalonada y ausencia de colisión entre fantasmas, igual que hoy. |
| El contador por frames se desincroniza si el navegador baja de 60 fps. | Los retardos son aproximados. El movimiento ya es por frames. Se documenta como ~segundos a 60 fps. |
| El túnel rompe el BFS si no se envuelven las coordenadas. | `shortestPathDir` envuelve `x` en la fila 14 antes de comprobar `isWall`. |

## What is **not** in this spec

- Power pellets y modo asustado.
- Ciclos scatter/chase por temporizador.
- Formas, antenas o etiquetas por fantasma.
- Nuevas reglas de reentrada al pen.
- Nuevos niveles, sonido, controles móviles, multijugador o persistencia.

Cada uno de esos puntos, si llega, va en su propia spec.

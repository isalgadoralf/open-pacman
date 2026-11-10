# AGENTS.md

## Qué es esto

Clon de Pac-Man en vanilla JS (HTML/CSS/JS puro). El repo existe como ejercicio de aprendizaje de **desarrollo dirigido por specs** (ver README), así que el flujo de specs de abajo es la forma principal de construir funcionalidades.

- No hay `package.json`, build, dependencias, tests, linter ni CI. No inventes ni añadas herramientas salvo que te lo pidan.
- Se ejecuta abriendo `src/index.html` directamente en el navegador (funciona desde `file://`).

## Restricciones de código (fáciles de romper)

- **Sin ES modules.** `src/index.html` carga cuatro `<script>` planos en orden de dependencia: `maze.js` → `game.js` → `render.js` → `main.js`. Todo lo declarado a nivel superior es un global compartido. Nunca añadas `import`/`export` ni `type="module"` — rompe tanto el orden de carga como `file://`.
- **`MAZE` es prístino.** `createGame()` lo copia a `game.grid` en cada partida; comer dots solo muta `game.grid`. El render debe leer `game.grid`, nunca `MAZE`.
- **El movimiento está alineado a la cuadrícula.** Las posiciones son coordenadas fraccionales de celda; los giros y chequeos de pared solo se ejecutan cuando `aligned()` (Pac-Man 1/8 celda/frame, fantasmas 1/10). La lógica nueva de movimiento/IA debe mantener este modelo o los actores atravesarán paredes.
- **Formato del laberinto:** `MAZE_STR` en `maze.js` son 31 strings de exactamente 28 chars, simétricos verticalmente. Tiles: `#` pared(1), `.` dot(2), ` ` vacío(0), `-` puerta del pen(3). El túnel es la fila 14. Los fantasmas pueden cruzar la puerta del pen; Pac-Man no (`isWall(..., actor)`).
- Los comentarios y el texto de la interfaz están en **español**; mantén eso, y responde en el idioma del prompt del usuario.

## Flujo de trabajo spec-driven

Los skills están vendoreados en `.agents/skills/` (`spec`, `spec-impl`; hashes fijados en `skills-lock.json`).

- `/spec <feature>` escribe una spec en `specs/NN-slug.md` en estado `Draft`. No se escribe código en ese comando.
- Solo el **humano** cambia la línea de estado a `Approved` (o el equivalente en cualquier idioma).
- `/spec-impl NN-slug` se niega a ejecutarse salvo que el estado signifique Approved; luego crea/cambia a la rama `spec-NN-slug` (automático salvo que `specs/.spec-config.yml` tenga `AutoCreateBranch: false`) e implementa el plan **un paso a cada vez, pausando para revisar el diff**.
- **Nunca hagas commit automático** — commitear es decisión y petición del usuario, incluso tras el último paso.
- Las peticiones fuera del alcance de la spec vuelven a la spec, no al código.
- `/spec` carga este archivo como memoria del proyecto, así que mantenlo corto.

## Verificación

No hay suite de tests. Verifica los cambios abriendo `src/index.html` y jugando; los valores de estado son `'start' | 'playing' | 'won' | 'lost'` en `game.state`.

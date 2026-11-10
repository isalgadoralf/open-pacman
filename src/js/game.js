// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
// Prioridad fija para desempatar decisiones de movimiento.
const DIR_PRIORITY = [ 'up', 'left', 'down', 'right' ];

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames

// Configuracion por rol de fantasma. El chaser es algo mas rapido (1/8 celda/
// frame, alinea cada 8 frames); el resto va a 1/10 (alinea cada 10 frames).
const GHOST_TYPES = {
  chaser:   { speed: 0.125, releaseDelay: 0 },
  ambusher: { speed: 0.1,   releaseDelay: 90 },
  flanker:  { speed: 0.1,   releaseDelay: 180 },
  shy:      { speed: 0.1,   releaseDelay: 270 },
};

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    elapsedFrames: 0,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_TYPES[ g.kind ].speed,
      kind: g.kind,
      releaseDelay: GHOST_TYPES[ g.kind ].releaseDelay,
      released: false,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Direcciones legales desde la celda alineada actual. Se excluye el sentido
// opuesto salvo que sea la unica salida (callejon sin salida).
function legalDirs( game, g ) {
  const grid = game.grid;
  const options = DIR_PRIORITY.filter(
    ( dir ) => canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  const forward = options.filter( ( dir ) => dir !== OPPOSITE[ g.dir ] );
  return forward.length ? forward : options;
}

// Elige la direccion legal que mas acerca (distancia Manhattan) al objetivo.
// Los empates se resuelven con la prioridad fija up, left, down, right.
function greedyDir( game, g, target ) {
  const choices = legalDirs( game, g );
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

// Celda de Pacman redondeada y recortada a los limites del laberinto.
function pacmanCell( game ) {
  const width = game.grid[ 0 ].length;
  const height = game.grid.length;
  return {
    x: Math.min( width - 1, Math.max( 0, Math.round( game.pacman.x ) ) ),
    y: Math.min( height - 1, Math.max( 0, Math.round( game.pacman.y ) ) ),
  };
}

// BFS sobre la cuadricula. Devuelve la primera direccion del camino mas corto
// desde 'from' hasta 'to', sin usar 'forbiddenDir' en el primer paso.
// Respeta paredes y puerta (los fantasmas pueden cruzar la puerta) y envuelve
// el tunel de la fila 14. Devuelve null si no hay ruta.
function shortestPathDir( grid, from, to, forbiddenDir ) {
  const width = grid[ 0 ].length;
  const queue = [ { x: from.x, y: from.y, first: null } ];
  const visited = new Set( [ from.x + ',' + from.y ] );

  while ( queue.length ) {
    const node = queue.shift();
    for ( const dir of DIR_PRIORITY ) {
      if ( node.first === null && dir === forbiddenDir ) continue;
      const d = DIRS[ dir ];
      let nx = node.x + d.x;
      let ny = node.y + d.y;
      // Tunel: envolver la x en la fila del tunel.
      if ( ny === TUNNEL_ROW ) {
        if ( nx < 0 ) nx += width;
        else if ( nx >= width ) nx -= width;
      }
      if ( isWall( grid, nx, ny, 'ghost' ) ) continue;
      const key = nx + ',' + ny;
      if ( visited.has( key ) ) continue;
      visited.add( key );
      const first = node.first || dir;
      if ( nx === to.x && ny === to.y ) return first;
      queue.push( { x: nx, y: ny, first } );
    }
  }
  return null;
}

function decideGhost( game, g ) {
  const target = pacmanCell( game );

  // El chaser usa BFS; el resto de roles elige objetivos y usa greedyDir.
  if ( g.kind === 'chaser' ) {
    const from = { x: g.x, y: g.y };
    let dir = shortestPathDir( game.grid, from, target, OPPOSITE[ g.dir ] );
    // Sin ruta respetando "no revertir": reintentar permitiendo el giro.
    if ( !dir ) dir = shortestPathDir( game.grid, from, target, null );
    // Ultimo recurso: decision voraz.
    g.dir = dir || greedyDir( game, g, target );
  } else if ( g.kind === 'ambusher' ) {
    // Apunta 4 celdas por delante de Pacman, sin recortar al tablero.
    const pd = DIRS[ game.pacman.dir ] || { x: 0, y: 0 };
    const ambush = { x: target.x + 4 * pd.x, y: target.y + 4 * pd.y };
    g.dir = greedyDir( game, g, ambush );
  } else if ( g.kind === 'flanker' ) {
    // Objetivo: 2 * (Pacman + 2 * direccion) - celda del chaser.
    const pd = DIRS[ game.pacman.dir ] || { x: 0, y: 0 };
    const chaser = game.ghosts.find( ( x ) => x.kind === 'chaser' );
    const cx = chaser ? Math.round( chaser.x ) : target.x;
    const cy = chaser ? Math.round( chaser.y ) : target.y;
    const flank = {
      x: 2 * ( target.x + 2 * pd.x ) - cx,
      y: 2 * ( target.y + 2 * pd.y ) - cy,
    };
    g.dir = greedyDir( game, g, flank );
  } else {
    // shy: persigue si esta lejos; si Pacman se acerca (<= 8 celdas), huye a
    // la esquina inferior izquierda.
    const gx = Math.round( g.x );
    const gy = Math.round( g.y );
    const dist = Math.abs( gx - target.x ) + Math.abs( gy - target.y );
    const goal = dist > 8 ? target : { x: 1, y: 29 };
    g.dir = greedyDir( game, g, goal );
  }
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Salida escalonada: el fantasma espera en el pen hasta su turno.
  if ( !g.released ) {
    if ( game.elapsedFrames < g.releaseDelay ) return;
    g.released = true;
  }

  // Dentro del pen (zona de la puerta) solo se sube, hasta salir a y <= 11.
  const inPen = g.y >= 12 && g.y <= 15 && g.x >= 11 && g.x <= 16;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    if ( inPen ) g.dir = 'up';
    else decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.elapsedFrames = 0;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.released = false;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  if ( game.state === 'playing' ) game.elapsedFrames++;
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;

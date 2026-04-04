// El Bosque Aural — main.js
// 13 fuentes, HRTF, navegación WASD + mouse, streaming por distancia

// — Árboles —
const ARBOLES = [
  {
    archivo: 'arboles/Santi Figueiras - Hacia lo Profundo.mp3',
    nombre: 'Hacia lo Profundo',
    pos: { x: 0, y: 0, z: -14 }
  },
  {
    archivo: 'arboles/BrunoMarchetti_BrunoMarchetti_Fungi_2025.mp3',
    nombre: 'Fungi',
    pos: { x: -18, y: 2, z: 8 }
  },
  {
    archivo: 'arboles/Daniel Lanark - La luz que refleja en el piso de una habitación vacía.mp3',
    nombre: 'La luz que refleja',
    pos: { x: 20, y: -3, z: 5 }
  },
  {
    archivo: 'arboles/Vidaesquiva_Arroyo_2025.mp3',
    nombre: 'Arroyo',
    pos: { x: 5, y: 6, z: 18 }
  },
  {
    archivo: 'arboles/AbiGail_AbigailCohen_CadaverExquisito_2025.mp3',
    nombre: 'Cadáver Exquisito',
    pos: { x: -10, y: -2, z: -24 }
  },
  {
    archivo: 'arboles/AloArco_AlondraAriza_Yugen_2025.mp3',
    nombre: 'Yugen',
    pos: { x: 28, y: 1, z: -16 }
  },
  {
    archivo: 'arboles/Cuarto Oscuro_Ronnie Bassili_Nébula_2025.mp3',
    nombre: 'Nébula',
    pos: { x: -26, y: 4, z: -12 }
  },
  {
    archivo: 'arboles/Daniel Garcia - sliding on the heights - Dan Torch.mp3',
    nombre: 'Sliding on the Heights',
    pos: { x: 14, y: -4, z: -30 }
  },
  {
    archivo: 'arboles/FernandoGuerra_(im)pulso_2025.mp3',
    nombre: '(im)pulso',
    pos: { x: -8, y: 5, z: 32 }
  },
  {
    archivo: 'arboles/PPP_AgustinaPaz_Loro_2025.mp3',
    nombre: 'Loro',
    pos: { x: -30, y: -1, z: 20 }
  },
  {
    archivo: 'arboles/Rocio Morgenstern - Desde nuestras ruinas.mp3',
    nombre: 'Desde nuestras ruinas',
    pos: { x: 22, y: 3, z: 26 }
  },
  {
    archivo: 'arboles/Synthiago Duran-Estalactitas.mp3',
    nombre: 'Estalactitas',
    pos: { x: -20, y: -5, z: -32 }
  },
  {
    archivo: 'arboles/_AlejandroZuluaga_Medikal_2025.mp3',
    nombre: 'Medikal',
    pos: { x: 34, y: 2, z: -4 }
  }
];

// — Parámetros del espacio —
const RADIO_BOSQUE       = 45;   // límite esférico del espacio
const VELOCIDAD          = 0.09; // unidades por frame
const SENS_MOUSE         = 0.0018;
const ROLLOFF            = 1.5;
const REF_DIST           = 1;
const MAX_DIST           = 80;
const ESCALA_POSICIONES  = 1.0;  // multiplica las posiciones de los árboles; < 1 = más juntos
const DIST_ACTIVACION    = 50;   // distancia máxima para activar un árbol
const FADE_TIEMPO        = 0.6;  // segundos de fade in/out al activar/desactivar

// — Estado del oyente —
let posicion = { x: 0, y: 0, z: 0 };
let yaw   = 0;   // rotación horizontal (radianes)
let pitch = 0;   // inclinación vertical

const teclas = new Set();

// — Inicio —
document.getElementById('btn-entrar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-entrar');
  btn.textContent = 'cargando...';
  btn.disabled = true;

  const audioCtx = new AudioContext();

  await cargarArboles(audioCtx);

  // Mostrar el bosque
  document.getElementById('inicio').style.display = 'none';
  const bosqueEl = document.getElementById('bosque');
  bosqueEl.style.display = 'block';

  // Pointer Lock
  bosqueEl.requestPointerLock();
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) {
      bosqueEl.addEventListener('click', () => bosqueEl.requestPointerLock(), { once: true });
    }
  });

  // Controles
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('keydown', e => {
    teclas.add(e.code);
    e.preventDefault(); // evitar scroll con flechas/espacio
  });
  document.addEventListener('keyup',  e => teclas.delete(e.code));

  // Desvanecer hint de controles después de 6s
  setTimeout(() => {
    document.getElementById('controles')?.classList.add('fade');
  }, 6000);

  // Loop principal
  const mapaCtx = document.getElementById('minimapa').getContext('2d');
  function frame() {
    mover();
    actualizarOyente(audioCtx);
    activarPorDistancia(audioCtx);
    dibujarMapa(mapaCtx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

// — Carga de audio (streaming via MediaElementSource) —
async function cargarArboles(audioCtx) {
  const promesas = ARBOLES.map(arbol => new Promise(resolve => {
    try {
      const el = new Audio(arbol.archivo);
      el.loop = true;
      el.preload = 'auto';

      const source = audioCtx.createMediaElementSource(el);

      const gain = audioCtx.createGain();
      gain.gain.value = 0;

      const panner = audioCtx.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance    = REF_DIST;
      panner.maxDistance    = MAX_DIST;
      panner.rolloffFactor = ROLLOFF;
      panner.positionX.value = arbol.pos.x * ESCALA_POSICIONES;
      panner.positionY.value = arbol.pos.y * ESCALA_POSICIONES;
      panner.positionZ.value = arbol.pos.z * ESCALA_POSICIONES;

      source.connect(gain);
      gain.connect(panner);
      panner.connect(audioCtx.destination);

      arbol.audioEl = el;
      arbol.gain    = gain;
      arbol.panner  = panner;
      arbol.activo  = false;
      arbol.cargado = true;

      el.addEventListener('canplaythrough', () => resolve(), { once: true });
      el.addEventListener('error', err => {
        console.warn(`[bosque] no se pudo cargar: ${arbol.archivo}`, err);
        arbol.cargado = false;
        resolve();
      });
      el.load();
    } catch (err) {
      console.warn(`[bosque] error preparando: ${arbol.archivo}`, err);
      resolve();
    }
  }));

  await Promise.all(promesas);
}

// — Mouse —
function onMouseMove(e) {
  if (!document.pointerLockElement) return;
  yaw   -= e.movementX * SENS_MOUSE;
  pitch -= e.movementY * SENS_MOUSE;
  // Límite de inclinación vertical
  pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
}

// — Movimiento —
function mover() {
  // Vectores de dirección en el plano horizontal
  const fx =  Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx =  Math.cos(yaw);
  const rz =  Math.sin(yaw);

  let dx = 0, dy = 0, dz = 0;

  if (teclas.has('KeyW') || teclas.has('ArrowUp'))    { dx += fx; dz += fz; }
  if (teclas.has('KeyS') || teclas.has('ArrowDown'))  { dx -= fx; dz -= fz; }
  if (teclas.has('KeyA') || teclas.has('ArrowLeft'))  { dx -= rx; dz -= rz; }
  if (teclas.has('KeyD') || teclas.has('ArrowRight')) { dx += rx; dz += rz; }
  if (teclas.has('KeyQ') || teclas.has('Space'))      dy += 1;
  if (teclas.has('KeyE') || teclas.has('ShiftLeft'))  dy -= 1;

  // Normalizar si hay movimiento diagonal
  const mag = Math.sqrt(dx*dx + dy*dy + dz*dz);
  if (mag > 0) { dx /= mag; dy /= mag; dz /= mag; }

  const nx = posicion.x + dx * VELOCIDAD;
  const ny = posicion.y + dy * VELOCIDAD;
  const nz = posicion.z + dz * VELOCIDAD;

  // Límite esférico — no salir del bosque
  const dist = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (dist < RADIO_BOSQUE) {
    posicion.x = nx;
    posicion.y = ny;
    posicion.z = nz;
  }
}

// — Minimapa —
// Diseño base 180×180; el tamaño real del canvas escala todo (p. ej. 900×900 ⇒ ×5).
function dibujarMapa(c) {
  const canvas = c.canvas;
  const W = canvas.width;
  const H = canvas.height;
  const s = W / 180;
  const cx = 78 * s, cy = 90 * s, r = 66 * s;
  const escala = r / RADIO_BOSQUE;
  const grosor = Math.max(1, s);

  c.clearRect(0, 0, W, H);

  c.fillStyle = 'rgba(8, 8, 8, 0.9)';
  c.fillRect(0, 0, W, H);

  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.strokeStyle = '#1e1e1e';
  c.lineWidth = grosor;
  c.stroke();

  const rArbol = 3.5 * s;
  for (const arbol of ARBOLES) {
    const ax = cx + arbol.pos.x * ESCALA_POSICIONES * escala;
    const ay = cy + arbol.pos.z * ESCALA_POSICIONES * escala;
    c.beginPath();
    c.arc(ax, ay, rArbol, 0, Math.PI * 2);
    c.fillStyle = !arbol.cargado ? '#222' : arbol.activo ? '#3a7a3a' : '#2d5c2d';
    c.fill();
  }

  const px = cx + posicion.x * escala;
  const py = cy + posicion.z * escala;
  const lineaLen = 11 * s;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px + Math.sin(yaw) * lineaLen, py - Math.cos(yaw) * lineaLen);
  c.strokeStyle = '#777';
  c.lineWidth = grosor;
  c.stroke();

  c.beginPath();
  c.arc(px, py, rArbol, 0, Math.PI * 2);
  c.fillStyle = '#d0d0d0';
  c.fill();

  const barX = 159 * s, barY = 24 * s, barW = 7 * s, barH = 132 * s;
  const yMin = -RADIO_BOSQUE, yMax = RADIO_BOSQUE;
  const tNorm = 1 - (posicion.y - yMin) / (yMax - yMin);
  const indicadorY = barY + tNorm * barH;

  c.fillStyle = '#151515';
  c.fillRect(barX, barY, barW, barH);

  const ceroY = barY + barH / 2;
  c.fillStyle = '#222';
  c.fillRect(barX, ceroY, barW, grosor);

  c.fillStyle = '#555';
  c.fillRect(barX, indicadorY - 2 * s, barW, 4 * s);
}

// — Activar/desactivar árboles por proximidad —
function activarPorDistancia(audioCtx) {
  const t = audioCtx.currentTime;

  for (const arbol of ARBOLES) {
    if (!arbol.audioEl || !arbol.cargado) continue;

    const ax = arbol.pos.x * ESCALA_POSICIONES;
    const ay = arbol.pos.y * ESCALA_POSICIONES;
    const az = arbol.pos.z * ESCALA_POSICIONES;
    const dx = posicion.x - ax;
    const dy = posicion.y - ay;
    const dz = posicion.z - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < DIST_ACTIVACION && !arbol.activo) {
      arbol.audioEl.play();
      arbol.gain.gain.cancelScheduledValues(t);
      arbol.gain.gain.setTargetAtTime(1, t, FADE_TIEMPO / 3);
      arbol.activo = true;
    } else if (dist >= DIST_ACTIVACION && arbol.activo) {
      arbol.gain.gain.cancelScheduledValues(t);
      arbol.gain.gain.setTargetAtTime(0, t, FADE_TIEMPO / 3);
      arbol.activo = false;
    }
  }
}

// — Actualizar posición y orientación del oyente —
function actualizarOyente(audioCtx) {
  const L = audioCtx.listener;

  L.positionX.value = posicion.x;
  L.positionY.value = posicion.y;
  L.positionZ.value = posicion.z;

  // Vector forward (con pitch)
  const cosPitch = Math.cos(pitch);
  L.forwardX.value =  Math.sin(yaw) * cosPitch;
  L.forwardY.value =  Math.sin(pitch);
  L.forwardZ.value = -Math.cos(yaw) * cosPitch;

  // Vector up (siempre apuntando al cielo)
  L.upX.value = 0;
  L.upY.value = 1;
  L.upZ.value = 0;
}

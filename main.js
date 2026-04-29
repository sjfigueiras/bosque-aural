import { createMovementEngine } from './movement-engine.js';
import { createKeyboardMouseMode } from './keyboard-mouse-mode.js';
import { createRandomWalkMode } from './random-walk-mode.js';
import { createDeviceProfile } from './device-profile.js';
import { createModePill } from './mode-pill.js';
import {
  ARBOLES,
  DISTANCE_MODEL,
  DIST_ACTIVACION,
  ESCALA_POSICIONES,
  FADE_TIEMPO,
  INITIAL_MOVEMENT_STATE,
  MAX_DIST,
  PANNING_MODEL,
  RADIO_BOSQUE,
  REF_DIST,
  ROLLOFF,
  SENS_MOUSE,
  VELOCIDAD
} from './constants.js';

// El Bosque Aural — main.js
// 13 fuentes, HRTF, navegación WASD + mouse, streaming por distancia

const AUDIO_BASE_URL = (
  window.BOSQUE_CONFIG?.audioBaseUrl ||
  window.BOSQUE_AUDIO_BASE_URL ||
  ''
).trim().replace(/\/+$/, '');

function resolverModoMovimientoInicial() {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = String(
    params.get('mode') ||
    window.BOSQUE_CONFIG?.movementMode ||
    window.BOSQUE_MOVEMENT_MODE ||
    'keyboardMouse'
  ).trim();

  return requestedMode.toLowerCase() === 'randomwalk' ? 'randomWalk' : 'keyboardMouse';
}

function actualizarHintControles(hints) {
  const controlesEl = document.getElementById('controles');
  if (!controlesEl) return;

  controlesEl.innerHTML = hints || '';
}

function resolverRutaAudio(rutaOriginal) {
  if (!AUDIO_BASE_URL) return rutaOriginal;
  const nombreArchivo = rutaOriginal.split('/').pop();
  return `${AUDIO_BASE_URL}/${nombreArchivo}`;
}

const deviceProfile = createDeviceProfile();

let movementState = {
  position: { ...INITIAL_MOVEMENT_STATE.position },
  yaw: INITIAL_MOVEMENT_STATE.yaw,
  pitch: INITIAL_MOVEMENT_STATE.pitch
};

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
  const initialModeId = resolverModoMovimientoInicial();

  const keyboardMouseMode = createKeyboardMouseMode({
    targetElement: bosqueEl,
    sensitivity: SENS_MOUSE,
    velocity: VELOCIDAD
  });
  const randomWalkMode = createRandomWalkMode({
    velocity: VELOCIDAD * 0.50
  });

  const allModes = { keyboardMouse: keyboardMouseMode, randomWalk: randomWalkMode };
  const availableMetas = Object.values(allModes)
    .filter(m => m.meta.availableOn[deviceProfile.platform])
    .map(m => m.meta);

  const validInitialModeId = availableMetas.some(m => m.id === initialModeId)
    ? initialModeId
    : availableMetas[0].id;

  let modePill = null;
  let syncWalkStop = null;

  const movementEngine = createMovementEngine({
    initialState: INITIAL_MOVEMENT_STATE,
    bounds: { radius: RADIO_BOSQUE },
    modes: allModes,
    initialModeId: validInitialModeId,
    onModeChange({ modeId, uiHints }) {
      actualizarHintControles(uiHints);
      modePill?.setActiveMode(modeId);
      syncWalkStop?.();
    }
  });
  movementState = movementEngine.getState();

  const pillEl = document.getElementById('mode-pill');
  const popoverEl = document.getElementById('mode-popover');
  modePill = createModePill({
    pillEl,
    popoverEl,
    availableMetas,
    initialModeId: validInitialModeId,
    onSelect: modeId => movementEngine.setMode(modeId)
  });
  if (availableMetas.length <= 1) {
    pillEl.disabled = true;
  }

  // — Walk / stop —
  const walkStopEl = document.getElementById('walk-stop');
  walkStopEl.innerHTML = '<span class="ws-icon"></span><span class="ws-label"></span>';
  const wsLabel = walkStopEl.querySelector('.ws-label');

  syncWalkStop = function () {
    const mode = allModes[movementEngine.getModeId()];
    const supports = mode?.meta?.supportsWalkToggle ?? false;
    walkStopEl.hidden = !supports;
    if (!supports) return;
    const walking = mode.isWalking();
    walkStopEl.dataset.state = walking ? 'walking' : 'stopped';
    wsLabel.textContent = walking ? 'stop' : 'walk';
  }

  walkStopEl.addEventListener('click', () => {
    const mode = allModes[movementEngine.getModeId()];
    if (!mode?.meta?.supportsWalkToggle) return;
    mode.setWalking(!mode.isWalking());
    syncWalkStop();
  });

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const mode = allModes[movementEngine.getModeId()];
    if (!mode?.meta?.supportsWalkToggle) return;
    e.preventDefault();
    mode.setWalking(!mode.isWalking());
    syncWalkStop();
  });

  syncWalkStop();

  // — Pause modal —
  const modalEl = document.getElementById('pause-modal');
  const modalModesEl = document.getElementById('pause-modal-modes');
  const modalResumeEl = document.getElementById('pause-modal-resume');

  function openModal() {
    if (movementEngine.getModeId() === 'randomWalk') {
      allModes.randomWalk.setWalking(false);
      syncWalkStop();
    }
    for (const btn of modalModesEl.querySelectorAll('.pause-mode-btn')) {
      btn.classList.toggle('active', btn.dataset.modeId === movementEngine.getModeId());
    }
    modalEl.hidden = false;
  }

  function closeModal(nextModeId) {
    modalEl.hidden = true;
    if (nextModeId && nextModeId !== movementEngine.getModeId()) {
      movementEngine.setMode(nextModeId);
    }
    if (movementEngine.getModeId() === 'keyboardMouse') {
      bosqueEl.requestPointerLock();
    } else {
      allModes.randomWalk.setWalking(true);
    }
    syncWalkStop();
  }

  // Prevent modal inner clicks from bubbling to bosqueEl (avoids double pointer-lock request)
  document.getElementById('pause-modal-inner').addEventListener('click', e => e.stopPropagation());

  for (const meta of availableMetas) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pause-mode-btn';
    btn.dataset.modeId = meta.id;
    btn.textContent = meta.label;
    btn.addEventListener('click', () => closeModal(meta.id));
    modalModesEl.appendChild(btn);
  }

  modalResumeEl.addEventListener('click', () => closeModal(null));

  // Keyboard mode: modal opens when pointer lock drops
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && movementEngine.getModeId() === 'keyboardMouse' && modalEl.hidden) {
      openModal();
    }
  });

  // Escape: open modal (random walk) or close it
  document.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return;
    if (!modalEl.hidden) closeModal(null);
    else if (movementEngine.getModeId() === 'randomWalk') openModal();
  });

  window.BOSQUE_DEBUG = {
    movementEngine,
    setMovementMode: modeId => movementEngine.setMode(modeId),
    getMovementMode: () => movementEngine.getModeId()
  };

  // Desvanecer hint de controles después de 6s
  setTimeout(() => {
    document.getElementById('controles')?.classList.add('fade');
  }, 6000);

  // Loop principal
  const mapaCtx = document.getElementById('minimapa').getContext('2d');
  function frame() {
    movementEngine.update();
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
      const rutaAudio = resolverRutaAudio(arbol.archivo);
      const audioElement = new Audio();
      audioElement.crossOrigin = 'anonymous';
      audioElement.src = rutaAudio;
      audioElement.loop = true;
      audioElement.preload = 'auto';

      const source = audioCtx.createMediaElementSource(audioElement);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;

      const pannerNode = audioCtx.createPanner();
      pannerNode.panningModel  = PANNING_MODEL;
      pannerNode.distanceModel = DISTANCE_MODEL;
      pannerNode.refDistance    = REF_DIST;
      pannerNode.maxDistance    = MAX_DIST;
      pannerNode.rolloffFactor = ROLLOFF;
      pannerNode.positionX.value = arbol.pos.x * ESCALA_POSICIONES;
      pannerNode.positionY.value = arbol.pos.y * ESCALA_POSICIONES;
      pannerNode.positionZ.value = arbol.pos.z * ESCALA_POSICIONES;

      source.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(audioCtx.destination);

      arbol.audioElement = audioElement;
      arbol.gainNode     = gainNode;
      arbol.pannerNode   = pannerNode;
      arbol.activo       = false;
      arbol.cargado      = true;

      audioElement.addEventListener('canplaythrough', () => resolve(), { once: true });
      audioElement.addEventListener('error', err => {
        console.warn(`[bosque] no se pudo cargar: ${rutaAudio}`, err);
        arbol.cargado = false;
        resolve();
      });
      audioElement.load();
    } catch (err) {
      console.warn(`[bosque] error preparando: ${arbol.archivo}`, err);
      resolve();
    }
  }));

  await Promise.all(promesas);
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

  const px = cx + movementState.position.x * escala;
  const py = cy + movementState.position.z * escala;
  const lineaLen = 11 * s;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px + Math.sin(movementState.yaw) * lineaLen, py - Math.cos(movementState.yaw) * lineaLen);
  c.strokeStyle = '#777';
  c.lineWidth = grosor;
  c.stroke();

  c.beginPath();
  c.arc(px, py, rArbol, 0, Math.PI * 2);
  c.fillStyle = '#d0d0d0';
  c.fill();

  const barX = 159 * s, barY = 24 * s, barW = 7 * s, barH = 132 * s;
  const yMin = -RADIO_BOSQUE, yMax = RADIO_BOSQUE;
  const tNorm = 1 - (movementState.position.y - yMin) / (yMax - yMin);
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
    if (!arbol.audioElement || !arbol.cargado) continue;

    const ax = arbol.pos.x * ESCALA_POSICIONES;
    const ay = arbol.pos.y * ESCALA_POSICIONES;
    const az = arbol.pos.z * ESCALA_POSICIONES;
  
    const dx = movementState.position.x - ax;
    const dy = movementState.position.y - ay;
    const dz = movementState.position.z - az;
  
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < DIST_ACTIVACION && !arbol.activo) {
      arbol.audioElement.play();
      arbol.gainNode.gain.cancelScheduledValues(t);
      arbol.gainNode.gain.setTargetAtTime(1, t, FADE_TIEMPO / 3);
      arbol.activo = true;
    } else if (dist >= DIST_ACTIVACION && arbol.activo) {
      arbol.gainNode.gain.cancelScheduledValues(t);
      arbol.gainNode.gain.setTargetAtTime(0, t, FADE_TIEMPO / 3);
      arbol.activo = false;
    }
  }
}

// — Actualizar posición y orientación del oyente —
function actualizarOyente(audioCtx) {
  const L = audioCtx.listener;

  L.positionX.value = movementState.position.x;
  L.positionY.value = movementState.position.y;
  L.positionZ.value = movementState.position.z;

  // Vector forward (con pitch)
  const cosPitch = Math.cos(movementState.pitch);
  L.forwardX.value =  Math.sin(movementState.yaw) * cosPitch;
  L.forwardY.value =  Math.sin(movementState.pitch);
  L.forwardZ.value = -Math.cos(movementState.yaw) * cosPitch;

  // Vector up (siempre apuntando al cielo)
  L.upX.value = 0;
  L.upY.value = 1;
  L.upZ.value = 0;
}

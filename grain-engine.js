import {
  GRAIN_BASE_DENSITY,
  GRAIN_DURATION_MIN,
  GRAIN_DURATION_MAX,
  GRAIN_ENVELOPE_ATTACK,
  GRAIN_ENVELOPE_RELEASE,
  GRAIN_LOOKAHEAD,
  GRAIN_VELOCITY_FACTOR,
  GRAIN_MASTER_GAIN,
  ESCALA_POSICIONES,
  PANNING_MODEL,
  DISTANCE_MODEL,
  REF_DIST,
  MAX_DIST,
  ROLLOFF
} from './constants.js';

export function createGrainEngine({ audioCtx, manifest, treeData, destination }) {
  const grainsByTree = new Map();
  for (const grain of manifest.grains) {
    if (!grainsByTree.has(grain.tree)) grainsByTree.set(grain.tree, []);
    grainsByTree.get(grain.tree).push(grain);
  }

  const buffers = new Map();

  const clouds = treeData.map((arbol, i) => createGrainCloud({
    audioCtx,
    grains: grainsByTree.get(i) || [],
    arbol,
    destination,
    getBuffer: () => buffers.get(i),
    loadBuffer: async () => {
      if (buffers.has(i)) return;
      const audioBaseUrl = (window.BOSQUE_CONFIG?.audioBaseUrl || window.BOSQUE_AUDIO_BASE_URL || '')
        .trim().replace(/\/+$/, '');
      const url = audioBaseUrl
        ? `${audioBaseUrl}/${arbol.archivo.split('/').pop()}`
        : arbol.archivo;
      try {
        const resp = await fetch(url);
        const ab = await resp.arrayBuffer();
        buffers.set(i, await audioCtx.decodeAudioData(ab));
      } catch (e) {
        console.warn(`[grains] no se pudo decodificar buffer para árbol ${i}`, e);
      }
    }
  }));

  function update(velocity) {
    for (const cloud of clouds) cloud.tick(velocity);
  }

  function setActive(treeIndex, active) {
    clouds[treeIndex]?.setActive(active);
  }

  function destroy() {
    for (const cloud of clouds) cloud.destroy();
  }

  return { update, setActive, destroy };
}

function createGrainCloud({ audioCtx, grains, arbol, destination, getBuffer, loadBuffer }) {
  let active = false;
  let nextGrainTime = 0;

  const pannerNode = audioCtx.createPanner();
  pannerNode.panningModel  = PANNING_MODEL;
  pannerNode.distanceModel = DISTANCE_MODEL;
  pannerNode.refDistance   = REF_DIST;
  pannerNode.maxDistance   = MAX_DIST;
  pannerNode.rolloffFactor = ROLLOFF;
  pannerNode.positionX.value = arbol.pos.x * ESCALA_POSICIONES;
  pannerNode.positionY.value = arbol.pos.y * ESCALA_POSICIONES;
  pannerNode.positionZ.value = arbol.pos.z * ESCALA_POSICIONES;

  const masterGain = audioCtx.createGain();
  masterGain.gain.value = GRAIN_MASTER_GAIN;
  masterGain.connect(pannerNode);
  pannerNode.connect(destination);

  function tick(velocity) {
    if (!active || grains.length === 0) return;

    const buffer = getBuffer();
    if (!buffer) return;

    const now = audioCtx.currentTime;
    const density = GRAIN_BASE_DENSITY * (1 + velocity * GRAIN_VELOCITY_FACTOR);
    const interval = 1 / density;

    while (nextGrainTime < now + GRAIN_LOOKAHEAD) {
      if (nextGrainTime < now) nextGrainTime = now;
      scheduleGrain(nextGrainTime, velocity, buffer);
      // slight jitter to avoid rhythmic pulsing
      nextGrainTime += interval * (0.7 + Math.random() * 0.6);
    }
  }

  function scheduleGrain(when, velocity, buffer) {
    const grain = selectGrain(velocity);
    const duration = GRAIN_DURATION_MIN
      + Math.random() * (GRAIN_DURATION_MAX - GRAIN_DURATION_MIN);
    const attack  = GRAIN_ENVELOPE_ATTACK;
    const release = GRAIN_ENVELOPE_RELEASE;

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(1, when + attack);
    env.gain.setValueAtTime(1, when + duration - release);
    env.gain.linearRampToValueAtTime(0, when + duration);
    env.connect(masterGain);

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const startOffset = Math.min(grain.startSec, Math.max(0, buffer.duration - duration));
    src.connect(env);
    src.start(when, startOffset, duration);
    src.onended = () => { src.disconnect(); env.disconnect(); };
  }

  function selectGrain(velocity) {
    // Moving faster surfaces brighter, more energetic grains — movement disturbs the soil.
    // At velocity ≥ 0.4 the pool shrinks toward the top 20–56% brightest grains.
    if (velocity > 0.4 && grains.length > 1) {
      const brightFraction = 0.8 - velocity * 0.6;
      const sorted = grains.slice().sort(
        (a, b) => (b.spectral?.centroid ?? 0) - (a.spectral?.centroid ?? 0)
      );
      const poolSize = Math.max(1, Math.ceil(sorted.length * brightFraction));
      return sorted[Math.floor(Math.random() * poolSize)];
    }
    return grains[Math.floor(Math.random() * grains.length)];
  }

  function setActive(val) {
    if (val && !active) {
      active = true;
      nextGrainTime = audioCtx.currentTime;
      loadBuffer();
    } else if (!val) {
      active = false;
    }
  }

  function destroy() {
    active = false;
    masterGain.disconnect();
    pannerNode.disconnect();
  }

  return { tick, setActive, destroy };
}

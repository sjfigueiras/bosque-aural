// — Árboles —
export const ARBOLES = [
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
export const RADIO_BOSQUE      = 45;   // límite esférico del espacio
export const VELOCIDAD         = 0.09; // unidades por frame
export const SENS_MOUSE        = 0.0018;
export const PANNING_MODEL     = 'HRTF';
export const DISTANCE_MODEL    = 'inverse';
export const ROLLOFF           = 1.5;
export const REF_DIST          = 1;
export const MAX_DIST          = 80;
export const ESCALA_POSICIONES = 1.0;  // multiplica las posiciones de los árboles; < 1 = más juntos
export const DIST_ACTIVACION   = 50;   // distancia máxima para activar un árbol
export const FADE_TIEMPO       = 0.6;  // segundos de fade in/out al activar/desactivar

// — Estado del oyente —
export const INITIAL_MOVEMENT_STATE = {
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0
};

// — Capa granular —
export const GRAIN_BASE_DENSITY     = 3;     // granos/seg por árbol activo
export const GRAIN_DURATION_MIN     = 0.06;  // segundos
export const GRAIN_DURATION_MAX     = 0.22;  // segundos
export const GRAIN_ENVELOPE_ATTACK  = 0.02;  // segundos
export const GRAIN_ENVELOPE_RELEASE = 0.05;  // segundos
export const GRAIN_LOOKAHEAD        = 0.1;   // adelanto del scheduler (segundos)
export const GRAIN_VELOCITY_FACTOR  = 2.0;   // multiplicador de densidad a velocidad máxima
export const GRAIN_MASTER_GAIN      = 0.35;  // nivel de mezcla de la capa granular
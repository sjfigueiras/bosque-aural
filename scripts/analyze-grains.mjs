/**
 * Offline grain analysis pipeline using FluCoMa CLI.
 *
 * Prerequisites:
 *   - FluCoMa CLI executables in PATH (fluid-noveltyslice, fluid-bufmfcc,
 *     fluid-bufspectralshape, fluid-bufpitch, fluid-bufloudness, fluid-bufstats,
 *     fluid-umap)
 *   - ffmpeg in PATH (for MP3 → WAV conversion)
 *
 * Usage:
 *   node scripts/analyze-grains.mjs            # analyze, write public/grains.json
 *   node scripts/analyze-grains.mjs --upload   # also upload to Cloudflare R2
 *   node scripts/analyze-grains.mjs --force    # re-analyze even if cached
 *
 * For R2 upload, set CLOUDFLARE_R2_BUCKET env var (auth handled by wrangler login).
 *
 * Incremental: per-tree results cached in .grains-state.json by source file SHA-256.
 * UMAP re-runs globally whenever any tree changes (embedding is relative).
 *
 * FluCoMa CLI output format: WAV files where float32 samples encode descriptor data.
 * Parse by skipping the 44-byte WAV header and reading as little-endian float32.
 */

import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(ROOT, 'tmp', 'grains');
const STATE_FILE = join(ROOT, '.grains-state.json');
const OUT_FILE = join(ROOT, 'public', 'grains.json');

const args = process.argv.slice(2);
const UPLOAD = args.includes('--upload');
const FORCE  = args.includes('--force');

// ─── Constants mirrored from the project (avoid ESM import in Node context) ──
const ARBOLES = [
  { archivo: 'arboles/Santi Figueiras - Hacia lo Profundo.mp3' },
  { archivo: 'arboles/BrunoMarchetti_BrunoMarchetti_Fungi_2025.mp3' },
  { archivo: 'arboles/Daniel Lanark - La luz que refleja en el piso de una habitación vacía.mp3' },
  { archivo: 'arboles/Vidaesquiva_Arroyo_2025.mp3' },
  { archivo: 'arboles/AbiGail_AbigailCohen_CadaverExquisito_2025.mp3' },
  { archivo: 'arboles/AloArco_AlondraAriza_Yugen_2025.mp3' },
  { archivo: 'arboles/Cuarto Oscuro_Ronnie Bassili_Nébula_2025.mp3' },
  { archivo: 'arboles/Daniel Garcia - sliding on the heights - Dan Torch.mp3' },
  { archivo: 'arboles/FernandoGuerra_(im)pulso_2025.mp3' },
  { archivo: 'arboles/PPP_AgustinaPaz_Loro_2025.mp3' },
  { archivo: 'arboles/Rocio Morgenstern - Desde nuestras ruinas.mp3' },
  { archivo: 'arboles/Synthiago Duran-Estalactitas.mp3' },
  { archivo: 'arboles/_AlejandroZuluaga_Medikal_2025.mp3' },
];

const SAMPLE_RATE = 44100;
const NUM_MFCC    = 13;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireTool(name) {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`[analyze-grains] required tool not found in PATH: ${name}`);
    process.exit(1);
  }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** Parse FluCoMa CLI output WAV: skip 44-byte header, read float32 LE samples. */
function parseFluComaWav(filePath) {
  const buf = readFileSync(filePath);
  const floatCount = (buf.length - 44) / 4;
  const result = new Float32Array(floatCount);
  for (let i = 0; i < floatCount; i++) {
    result[i] = buf.readFloatLE(44 + i * 4);
  }
  return result;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`[${cmd}] exited with ${r.status}\n${r.stderr}`);
  }
  return r;
}

// ─── Per-tree analysis ────────────────────────────────────────────────────────

/**
 * Analyze one audio file, return array of grain descriptors:
 * [{ startSec, durationSec, mfcc: [...], spectral: {...}, pitch, loudness }]
 */
function analyzeTree(audioPath, treeIndex) {
  const id = `tree${treeIndex}`;
  const wavPath   = join(TMP, `${id}.wav`);
  const slicePath = join(TMP, `${id}_slices.wav`);

  // 1. Convert to mono 44.1 kHz WAV
  run('ffmpeg', ['-y', '-i', audioPath, '-ac', '1', '-ar', String(SAMPLE_RATE), wavPath]);
  console.log(`  [tree ${treeIndex}] converted to WAV`);

  // 2. Slice with NoveltySlice (threshold tunable; 0.5 gives ~1–5 sec segments)
  run('fluid-noveltyslice', [
    '-source', wavPath,
    '-indices', slicePath,
    '-threshold', '0.5',
    '-kernelsize', '11'
  ]);

  const sliceData = parseFluComaWav(slicePath);
  // sliceData contains frame indices of slice boundaries (non-zero = boundary)
  const boundaryFrames = [];
  for (let i = 0; i < sliceData.length; i++) {
    if (sliceData[i] > 0) boundaryFrames.push(i);
  }
  if (boundaryFrames.length === 0) boundaryFrames.push(0);

  console.log(`  [tree ${treeIndex}] ${boundaryFrames.length} slices found`);

  // Build (startFrame, endFrame) pairs
  const totalSamples = sliceData.length;
  const segments = [];
  for (let i = 0; i < boundaryFrames.length; i++) {
    const start = boundaryFrames[i];
    const end   = i + 1 < boundaryFrames.length ? boundaryFrames[i + 1] : totalSamples;
    if (end - start > SAMPLE_RATE * 0.05) { // skip segments < 50 ms
      segments.push({ start, end });
    }
  }

  // 3. Extract descriptors for each segment
  const grains = [];
  for (let s = 0; s < segments.length; s++) {
    const { start, end } = segments[s];
    const startSec    = start / SAMPLE_RATE;
    const durationSec = (end - start) / SAMPLE_RATE;
    const segId = `${id}_seg${s}`;

    const mfccOut     = join(TMP, `${segId}_mfcc.wav`);
    const spectralOut = join(TMP, `${segId}_spectral.wav`);
    const pitchOut    = join(TMP, `${segId}_pitch.wav`);
    const loudOut     = join(TMP, `${segId}_loud.wav`);
    const statsOut    = join(TMP, `${segId}_stats.wav`);

    try {
      // MFCC
      run('fluid-bufmfcc', [
        '-source', wavPath,
        '-startframe', String(start),
        '-numframes', String(end - start),
        '-features', mfccOut,
        '-numcoeffs', String(NUM_MFCC)
      ]);
      run('fluid-bufstats', ['-source', mfccOut, '-stats', statsOut]);
      // bufstats outputs [mean, std, skewness, kurtosis, lo, mid, hi] per coeff
      // we take just the mean (first value per coeff)
      const mfccStats = parseFluComaWav(statsOut);
      const mfcc = Array.from({ length: NUM_MFCC }, (_, i) => mfccStats[i * 7] ?? 0);

      // Spectral shape (centroid, spread, skewness, kurtosis, flatness, rolloff, crest)
      run('fluid-bufspectralshape', [
        '-source', wavPath,
        '-startframe', String(start),
        '-numframes', String(end - start),
        '-features', spectralOut
      ]);
      run('fluid-bufstats', ['-source', spectralOut, '-stats', statsOut]);
      const spectralStats = parseFluComaWav(statsOut);
      const spectral = {
        centroid: spectralStats[0] ?? 0,
        spread:   spectralStats[7] ?? 0,
        flatness: spectralStats[28] ?? 0
      };

      // Pitch (YinFFT)
      run('fluid-bufpitch', [
        '-source', wavPath,
        '-startframe', String(start),
        '-numframes', String(end - start),
        '-features', pitchOut
      ]);
      run('fluid-bufstats', ['-source', pitchOut, '-stats', statsOut]);
      const pitchStats = parseFluComaWav(statsOut);
      const pitch = pitchStats[0] ?? 0; // mean pitch (Hz)

      // Loudness
      run('fluid-bufloudness', [
        '-source', wavPath,
        '-startframe', String(start),
        '-numframes', String(end - start),
        '-features', loudOut
      ]);
      run('fluid-bufstats', ['-source', loudOut, '-stats', statsOut]);
      const loudStats = parseFluComaWav(statsOut);
      const loudness = loudStats[0] ?? -96; // mean loudness (dBFS)

      grains.push({ startSec, durationSec, mfcc, spectral, pitch, loudness });
    } catch (e) {
      console.warn(`  [tree ${treeIndex}] segment ${s} failed: ${e.message}`);
    }
  }

  console.log(`  [tree ${treeIndex}] ${grains.length} grain descriptors extracted`);
  return grains;
}

// ─── UMAP ─────────────────────────────────────────────────────────────────────

/**
 * Given flat array of feature vectors (length nGrains × nDims),
 * run fluid-umap and return array of [x, y] 2D coordinates.
 */
function runUmap(featureVectors, nGrains, nDims) {
  const inputPath  = join(TMP, 'umap_input.wav');
  const outputPath = join(TMP, 'umap_output.wav');

  // Write feature matrix as a WAV where each frame = one grain's feature vector.
  // fluid-umap expects a multichannel WAV: nDims channels, nGrains frames.
  const nSamples = nGrains * nDims;
  const wavBuf = Buffer.alloc(44 + nSamples * 4);

  // Minimal WAV header (PCM float32, nDims channels, 44100 Hz)
  wavBuf.write('RIFF', 0);
  wavBuf.writeUInt32LE(36 + nSamples * 4, 4);
  wavBuf.write('WAVE', 8);
  wavBuf.write('fmt ', 12);
  wavBuf.writeUInt32LE(16, 16);          // chunk size
  wavBuf.writeUInt16LE(3, 20);           // PCM float
  wavBuf.writeUInt16LE(nDims, 22);       // channels
  wavBuf.writeUInt32LE(SAMPLE_RATE, 24); // sample rate
  wavBuf.writeUInt32LE(SAMPLE_RATE * nDims * 4, 28); // byte rate
  wavBuf.writeUInt16LE(nDims * 4, 32);   // block align
  wavBuf.writeUInt16LE(32, 34);          // bits per sample
  wavBuf.write('data', 36);
  wavBuf.writeUInt32LE(nSamples * 4, 40);

  for (let i = 0; i < nSamples; i++) {
    wavBuf.writeFloatLE(featureVectors[i], 44 + i * 4);
  }
  writeFileSync(inputPath, wavBuf);

  run('fluid-umap', [
    '-source', inputPath,
    '-output', outputPath,
    '-numneighbours', '15',
    '-mindist', '0.1',
    '-numoutputdims', '2'
  ]);

  const rawOut = parseFluComaWav(outputPath);
  const coords = [];
  for (let i = 0; i < nGrains; i++) {
    coords.push([rawOut[i * 2] ?? 0, rawOut[i * 2 + 1] ?? 0]);
  }
  return coords;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Check prerequisites
  for (const tool of ['ffmpeg', 'fluid-noveltyslice', 'fluid-bufmfcc',
    'fluid-bufspectralshape', 'fluid-bufpitch', 'fluid-bufloudness',
    'fluid-bufstats', 'fluid-umap']) {
    requireTool(tool);
  }

  mkdirSync(TMP, { recursive: true });
  mkdirSync(join(ROOT, 'public'), { recursive: true });

  // Load incremental state
  let state = { version: 1, trees: {} };
  if (existsSync(STATE_FILE)) {
    try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch {}
  }

  let dirty = false;

  for (let i = 0; i < ARBOLES.length; i++) {
    const { archivo } = ARBOLES[i];
    const audioPath = join(ROOT, archivo);

    if (!existsSync(audioPath)) {
      console.warn(`[tree ${i}] not found: ${audioPath} — skipping`);
      continue;
    }

    const hash = sha256(audioPath);
    const cached = state.trees[archivo];

    if (!FORCE && cached?.sha256 === hash) {
      console.log(`[tree ${i}] unchanged, using cache (${cached.grains.length} grains)`);
      continue;
    }

    console.log(`[tree ${i}] analyzing: ${archivo}`);
    const grains = analyzeTree(audioPath, i);
    state.trees[archivo] = { sha256: hash, grains };
    dirty = true;
  }

  // Check if we have any grains at all
  const allGrainsWithTree = [];
  for (let i = 0; i < ARBOLES.length; i++) {
    const cached = state.trees[ARBOLES[i].archivo];
    if (!cached) continue;
    for (const grain of cached.grains) {
      allGrainsWithTree.push({ tree: i, archivo: ARBOLES[i].archivo, ...grain });
    }
  }

  if (allGrainsWithTree.length === 0) {
    console.error('[analyze-grains] no grains found — check that audio files exist and FluCoMa CLI is working');
    process.exit(1);
  }

  if (!dirty && existsSync(OUT_FILE)) {
    console.log(`[analyze-grains] nothing changed — grains.json is up to date (${allGrainsWithTree.length} grains)`);
  } else {
    // Run UMAP globally over all grain feature vectors
    console.log(`[analyze-grains] running UMAP over ${allGrainsWithTree.length} grains...`);
    const nDims = NUM_MFCC; // use MFCC as the UMAP input space
    const featureVectors = new Float32Array(allGrainsWithTree.length * nDims);
    for (let i = 0; i < allGrainsWithTree.length; i++) {
      for (let d = 0; d < nDims; d++) {
        featureVectors[i * nDims + d] = allGrainsWithTree[i].mfcc[d] ?? 0;
      }
    }

    let umapCoords;
    try {
      umapCoords = runUmap(featureVectors, allGrainsWithTree.length, nDims);
    } catch (e) {
      console.warn('[analyze-grains] UMAP failed, skipping 2D embedding:', e.message);
      umapCoords = allGrainsWithTree.map(() => [0, 0]);
    }

    // Merge UMAP coords into grains (not stored in state — recomputed each time)
    const grains = allGrainsWithTree.map((g, i) => ({ ...g, umap: umapCoords[i] }));

    writeFileSync(OUT_FILE, JSON.stringify({ grains }, null, 2));
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`[analyze-grains] wrote ${grains.length} grains to public/grains.json`);
  }

  if (UPLOAD) {
    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    if (!bucket) {
      console.error('[analyze-grains] CLOUDFLARE_R2_BUCKET env var not set — cannot upload');
      process.exit(1);
    }
    console.log(`[analyze-grains] uploading to R2 bucket: ${bucket}`);
    run('wrangler', [
      'r2', 'object', 'put',
      `${bucket}/grains.json`,
      '--file', OUT_FILE,
      '--content-type', 'application/json'
    ]);
    console.log('[analyze-grains] upload complete');
  }

  // Cleanup tmp
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log('[analyze-grains] done');
}

main().catch(e => { console.error(e); process.exit(1); });

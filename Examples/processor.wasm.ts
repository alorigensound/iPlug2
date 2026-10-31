/**
 * VST Effect Processor (AssemblyScript → WebAssembly)
 *
 * params.json defines all parameters. Both this file and editor.tsx
 * use the same API to access parameter indices by name.
 *
 * AssemblyScript reminders:
 * - Types: f32, i32, usize (NOT number, float, int)
 * - Use sin, cos, pow, PI etc. from "./dsp-runtime" (NOT Math.* or Mathf.*)
 * - Cast: <f32>x  (NOT (f32)x — that's C syntax, not AS)
 * - Module-level Float32Array/StaticArray is fine for buffers
 * - NEVER allocate (new) inside process()
 * - NEVER call smoothParam() outside 'for (let i = 0; i < frames; i++)' (use param() at block rate)
 * - ALWAYS wire every envelope (.tick()) and modulator into the signal path
 */
import {
  smoothParam,
  param,
  paramBool,
  smoothCoeff,
  resetSmoothing,
  dbToLinear,
  clamp,
  readSample,
  writeSample,
  exposeBuffer,
  abs,
  max,
  Biquad
} from "./dsp-runtime";
import { params, NUM_PARAMS } from "@flowmusic/params";

let sampleRate: f32 = 44100.0;
let coeff: f32 = 0.995;
let peakL: f32 = 0.0;
let peakR: f32 = 0.0;
const meters = new Float32Array(2);

// Filter instances (2nd-order Butterworth = 12 dB/oct)
// Bass: 12 dB/oct Lowpass at LowCrossover
const lpBassL = new Biquad();
const lpBassR = new Biquad();

// Mids: Bandpass built from 12 dB/oct Highpass at LowCrossover followed by 12 dB/oct Lowpass at HighCrossover
const hpMidL = new Biquad();
const hpMidR = new Biquad();
const lpMidL = new Biquad();
const lpMidR = new Biquad();

// Highs: 12 dB/oct Highpass at HighCrossover
const hpHighL = new Biquad();
const hpHighR = new Biquad();

// Butterworth Q factor for 12 dB/oct (2nd-order)
const Q_BUTTERWORTH: f32 = 0.70710678;

let lastBassCutoff: f32 = -1.0;
let lastMidLowCutoff: f32 = -1.0;
let lastMidHighCutoff: f32 = -1.0;
let lastHighCutoff: f32 = -1.0;

function updateFilters(bassFreq: f32, midLowFreq: f32, midHighFreq: f32, highFreq: f32): void {
  const bassClamped: f32 = clamp(bassFreq, 20.0, sampleRate * 0.45);
  const midLowClamped: f32 = clamp(midLowFreq, 20.0, sampleRate * 0.45);
  const midHighClamped: f32 = clamp(max(midHighFreq, midLowClamped + 5.0), 30.0, sampleRate * 0.45);
  const highClamped: f32 = clamp(highFreq, 20.0, sampleRate * 0.45);

  lpBassL.setLowpass(bassClamped, Q_BUTTERWORTH, sampleRate);
  lpBassR.setLowpass(bassClamped, Q_BUTTERWORTH, sampleRate);

  hpMidL.setHighpass(midLowClamped, Q_BUTTERWORTH, sampleRate);
  hpMidR.setHighpass(midLowClamped, Q_BUTTERWORTH, sampleRate);
  lpMidL.setLowpass(midHighClamped, Q_BUTTERWORTH, sampleRate);
  lpMidR.setLowpass(midHighClamped, Q_BUTTERWORTH, sampleRate);

  hpHighL.setHighpass(highClamped, Q_BUTTERWORTH, sampleRate);
  hpHighR.setHighpass(highClamped, Q_BUTTERWORTH, sampleRate);

  lastBassCutoff = bassClamped;
  lastMidLowCutoff = midLowClamped;
  lastMidHighCutoff = midHighClamped;
  lastHighCutoff = highClamped;
}

export function init(sr: f32): void {
  sampleRate = sr;
  coeff = smoothCoeff(5.0, sr);
  resetSmoothing();

  lpBassL.reset();
  lpBassR.reset();
  hpMidL.reset();
  hpMidR.reset();
  lpMidL.reset();
  lpMidR.reset();
  hpHighL.reset();
  hpHighR.reset();

  lastBassCutoff = -1.0;
  lastMidLowCutoff = -1.0;
  lastMidHighCutoff = -1.0;
  lastHighCutoff = -1.0;
  updateFilters(250.0, 270.0, 3800.0, 3500.0);

  exposeBuffer("meters", meters);
}

export function getNumParams(): i32 {
  return NUM_PARAMS;
}

export function process(
  inL: usize,
  inR: usize,
  outL: usize,
  outR: usize,
  frames: i32,
): void {
  // Read cutoff frequencies and flags at block rate
  const bassFreq = param(params["BassCutoff"]);
  const midLowFreq = param(params["MidLowCutoff"]);
  const midHighFreq = param(params["MidHighCutoff"]);
  const highFreq = param(params["HighCutoff"]);

  if (
    bassFreq != lastBassCutoff ||
    midLowFreq != lastMidLowCutoff ||
    midHighFreq != lastMidHighCutoff ||
    highFreq != lastHighCutoff
  ) {
    updateFilters(bassFreq, midLowFreq, midHighFreq, highFreq);
  }

  const soloBass = paramBool(params["SoloBass"]);
  const soloMids = paramBool(params["SoloMids"]);
  const soloHighs = paramBool(params["SoloHighs"]);
  const monitorMid = paramBool(params["MonitorMid"]);

  // Any band filter active?
  const anyFilterActive: bool = soloBass || soloMids || soloHighs;

  // BIT-TRANSPARENT PASS-THROUGH:
  // If nothing is active, copy inputs directly to outputs untouched.
  if (!anyFilterActive && !monitorMid) {
    for (let i: i32 = 0; i < frames; i++) {
      const dryL = readSample(inL, i);
      const dryR = readSample(inR, i);

      // Keep filter state synchronized in background so engaging a filter is click-free
      lpBassL.process(dryL);
      lpBassR.process(dryR);
      lpMidL.process(hpMidL.process(dryL));
      lpMidR.process(hpMidR.process(dryR));
      hpHighL.process(dryL);
      hpHighR.process(dryR);

      writeSample(outL, i, dryL);
      writeSample(outR, i, dryR);

      peakL = max(peakL, abs(dryL));
      peakR = max(peakR, abs(dryR));
    }
    meters[0] = peakL;
    meters[1] = peakR;
    peakL = 0.0;
    peakR = 0.0;
    return;
  }

  for (let i: i32 = 0; i < frames; i++) {
    let inSampleL = readSample(inL, i);
    let inSampleR = readSample(inR, i);

    // Apply Mid (Mono) monitoring if enabled: (L + R) * 0.5 for both channels
    if (monitorMid) {
      const monoMid: f32 = (inSampleL + inSampleR) * 0.5;
      inSampleL = monoMid;
      inSampleR = monoMid;
    }

    // Process through 12 dB/oct filters
    const bassL = lpBassL.process(inSampleL);
    const bassR = lpBassR.process(inSampleR);

    const midL = lpMidL.process(hpMidL.process(inSampleL));
    const midR = lpMidR.process(hpMidR.process(inSampleR));

    const highL = hpHighL.process(inSampleL);
    const highR = hpHighR.process(inSampleR);

    let finalL: f32 = 0.0;
    let finalR: f32 = 0.0;

    if (anyFilterActive) {
      // Sum only the active solo bands
      if (soloBass) {
        finalL += bassL;
        finalR += bassR;
      }
      if (soloMids) {
        finalL += midL;
        finalR += midR;
      }
      if (soloHighs) {
        finalL += highL;
        finalR += highR;
      }
    } else {
      // If no solo filter active, bypass filtering (original audio with mid/mono state applied)
      finalL = inSampleL;
      finalR = inSampleR;
    }

    finalL = clamp(finalL, -1.0, 1.0);
    finalR = clamp(finalR, -1.0, 1.0);

    writeSample(outL, i, finalL);
    writeSample(outR, i, finalR);

    peakL = max(peakL, abs(finalL));
    peakR = max(peakR, abs(finalR));
  }

  meters[0] = peakL;
  meters[1] = peakR;
  peakL = 0.0;
  peakR = 0.0;
}

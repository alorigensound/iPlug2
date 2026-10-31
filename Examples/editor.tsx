import React, { useRef, useState, useMemo } from "react";
import { useParam, useKeys, useCustomState } from "@flowmusic/vst";
import { PARAMS } from "@flowmusic/params";

interface KeyConfig {
  bassKey: string;
  midsKey: string;
  highsKey: string;
  midKey: string;
}

const DEFAULT_KEYS: KeyConfig = {
  bassKey: "1",
  midsKey: "2",
  highsKey: "3",
  midKey: "4",
};

function Knob({
  param,
  label,
}: {
  param: ReturnType<typeof useParam>;
  label?: string;
}) {
  const dragRef = useRef<{ startY: number; startNorm: number } | null>(null);
  const angle = -135 + param.normalized * 270;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startNorm: param.normalized };
    param.beginChange();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const next = Math.max(0, Math.min(1, dragRef.current.startNorm + dy / 150));
    param.setNormalized(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    param.endChange();
  };

  return (
    <div className="flex w-24 shrink-0 select-none flex-col items-center gap-1.5">
      <div
        role="slider"
        aria-label={label ?? param.def.name}
        aria-valuemin={param.def.min}
        aria-valuemax={param.def.max}
        aria-valuenow={param.value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => param.set(param.def.default)}
        className="relative flex h-14 w-14 cursor-ns-resize items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 shadow-md transition hover:border-zinc-500"
      >
        <div
          className="h-full w-full"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Gray flat indicator line */}
          <div className="mx-auto mt-1 h-3 w-1 rounded-full bg-zinc-400" />
        </div>
      </div>
      <span className="w-full truncate text-center text-xs font-semibold text-zinc-300">
        {label ?? param.def.name}
      </span>
      <span className="w-full truncate text-center font-mono text-[11px] tabular-nums text-zinc-400">
        {param.text}
      </span>
    </div>
  );
}

export default function EffectUI() {
  const soloBass = useParam(PARAMS.SoloBass);
  const soloMids = useParam(PARAMS.SoloMids);
  const soloHighs = useParam(PARAMS.SoloHighs);
  const monitorMid = useParam(PARAMS.MonitorMid);
  const bassCutoff = useParam(PARAMS.BassCutoff);
  const midLowCutoff = useParam(PARAMS.MidLowCutoff);
  const midHighCutoff = useParam(PARAMS.MidHighCutoff);
  const highCutoff = useParam(PARAMS.HighCutoff);

  const [keys, setKeys] = useCustomState<KeyConfig>(DEFAULT_KEYS);
  const [learningField, setLearningField] = useState<keyof KeyConfig | null>(null);

  const claimedKeys = useMemo(() => {
    const list = [keys.bassKey, keys.midsKey, keys.highsKey, keys.midKey].filter(
      (k) => Boolean(k) && k.trim().length > 0
    );
    return Array.from(new Set(list));
  }, [keys]);

  useKeys(claimedKeys, (press) => {
    if (learningField) return;

    const k = press.key.toLowerCase();
    const bass = keys.bassKey.toLowerCase();
    const mids = keys.midsKey.toLowerCase();
    const highs = keys.highsKey.toLowerCase();
    const mid = keys.midKey.toLowerCase();

    if (k === bass) {
      if (press.phase === "down") {
        soloBass.set(1);
      } else if (press.phase === "up") {
        soloBass.set(0);
      }
    }

    if (k === mids) {
      if (press.phase === "down") {
        soloMids.set(1);
      } else if (press.phase === "up") {
        soloMids.set(0);
      }
    }

    if (k === highs) {
      if (press.phase === "down") {
        soloHighs.set(1);
      } else if (press.phase === "up") {
        soloHighs.set(0);
      }
    }

    if (k === mid) {
      if (press.phase === "down" && !press.repeat) {
        monitorMid.set(monitorMid.value > 0.5 ? 0 : 1);
      }
    }
  });

  const handleKeyLearn = (field: keyof KeyConfig, keyName: string) => {
    if (!keyName || keyName === "Escape") {
      setLearningField(null);
      return;
    }
    setKeys((prev) => ({
      ...prev,
      [field]: keyName,
    }));
    setLearningField(null);
  };

  const isBassActive = soloBass.value > 0.5;
  const isMidsActive = soloMids.value > 0.5;
  const isHighsActive = soloHighs.value > 0.5;
  const isMidActive = monitorMid.value > 0.5;

  return (
    <div className="flex h-[600px] w-[800px] select-none flex-col items-center justify-center bg-zinc-950 p-6 text-white font-sans">
      {/* Sleek horizontal rectangular rack chassis */}
      <div className="flex w-full flex-col rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4 shadow-2xl">
        {/* Header: Clean centered Monitor Utility */}
        <div className="flex items-center justify-center border-b border-zinc-800/80 pb-2 mb-3">
          <h1 className="text-xs font-mono font-bold tracking-[0.35em] text-zinc-300 uppercase">
            MONITOR UTILITY
          </h1>
        </div>

        {/* Compact 4-column module section */}
        <div className="grid grid-cols-4 gap-3">
          {/* 1. BASS */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all duration-150 ${
              isBassActive
                ? "border-amber-400/80 bg-amber-950/20 shadow-md shadow-amber-900/20"
                : "border-zinc-800/80 bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-center text-center">
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: "#3280fc" }}
              >
                1. BASS
              </span>
            </div>

            <div className="my-2 flex justify-center">
              <Knob param={bassCutoff} label="Cutoff" />
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onPointerDown={() => soloBass.set(1)}
                onPointerUp={() => soloBass.set(0)}
                onPointerCancel={() => soloBass.set(0)}
                className={`w-full rounded-md py-2 text-xs font-bold tracking-wide transition ${
                  isBassActive
                    ? "bg-amber-400 text-black shadow-md shadow-amber-400/30"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600"
                }`}
              >
                SOLO BASS
              </button>

              <div className="flex items-center justify-between rounded bg-zinc-950/80 px-2 py-1 text-xs">
                <span className="text-[11px] text-zinc-400">Key:</span>
                {learningField === "bassKey" ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="Press..."
                    className="w-14 rounded bg-zinc-800 px-1 text-center font-mono text-xs focus:outline-none"
                    style={{ color: "#3280fc" }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      handleKeyLearn("bassKey", e.key);
                    }}
                    onBlur={() => setLearningField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLearningField("bassKey")}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold hover:border-blue-500"
                    style={{ color: "#3280fc" }}
                  >
                    [{keys.bassKey.toUpperCase()}]
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2. MIDS */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all duration-150 ${
              isMidsActive
                ? "border-emerald-400/80 bg-emerald-950/20 shadow-md shadow-emerald-900/20"
                : "border-zinc-800/80 bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-center text-center">
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: "#3280fc" }}
              >
                2. MIDS
              </span>
            </div>

            <div className="my-2 flex justify-center gap-1">
              <Knob param={midLowCutoff} label="Low Cut" />
              <Knob param={midHighCutoff} label="High Cut" />
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onPointerDown={() => soloMids.set(1)}
                onPointerUp={() => soloMids.set(0)}
                onPointerCancel={() => soloMids.set(0)}
                className={`w-full rounded-md py-2 text-xs font-bold tracking-wide transition ${
                  isMidsActive
                    ? "bg-emerald-400 text-black shadow-md shadow-emerald-400/30"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600"
                }`}
              >
                SOLO MIDS
              </button>

              <div className="flex items-center justify-between rounded bg-zinc-950/80 px-2 py-1 text-xs">
                <span className="text-[11px] text-zinc-400">Key:</span>
                {learningField === "midsKey" ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="Press..."
                    className="w-14 rounded bg-zinc-800 px-1 text-center font-mono text-xs focus:outline-none"
                    style={{ color: "#3280fc" }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      handleKeyLearn("midsKey", e.key);
                    }}
                    onBlur={() => setLearningField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLearningField("midsKey")}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold hover:border-blue-500"
                    style={{ color: "#3280fc" }}
                  >
                    [{keys.midsKey.toUpperCase()}]
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3. HIGHS */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all duration-150 ${
              isHighsActive
                ? "border-indigo-400/80 bg-indigo-950/20 shadow-md shadow-indigo-900/20"
                : "border-zinc-800/80 bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-center text-center">
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: "#3280fc" }}
              >
                3. HIGHS
              </span>
            </div>

            <div className="my-2 flex justify-center">
              <Knob param={highCutoff} label="Cutoff" />
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onPointerDown={() => soloHighs.set(1)}
                onPointerUp={() => soloHighs.set(0)}
                onPointerCancel={() => soloHighs.set(0)}
                className={`w-full rounded-md py-2 text-xs font-bold tracking-wide transition ${
                  isHighsActive
                    ? "bg-indigo-400 text-black shadow-md shadow-indigo-400/30"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600"
                }`}
              >
                SOLO HIGHS
              </button>

              <div className="flex items-center justify-between rounded bg-zinc-950/80 px-2 py-1 text-xs">
                <span className="text-[11px] text-zinc-400">Key:</span>
                {learningField === "highsKey" ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="Press..."
                    className="w-14 rounded bg-zinc-800 px-1 text-center font-mono text-xs focus:outline-none"
                    style={{ color: "#3280fc" }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      handleKeyLearn("highsKey", e.key);
                    }}
                    onBlur={() => setLearningField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLearningField("highsKey")}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold hover:border-blue-500"
                    style={{ color: "#3280fc" }}
                  >
                    [{keys.highsKey.toUpperCase()}]
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. MID (MONO) MONITOR */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-3 transition-all duration-150 ${
              isMidActive
                ? "border-cyan-400/80 bg-cyan-950/20 shadow-md shadow-cyan-900/20"
                : "border-zinc-800/80 bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center justify-center text-center">
              <span
                className="text-xs font-bold tracking-wider"
                style={{ color: "#3280fc" }}
              >
                4. MID (MONO)
              </span>
            </div>

            {/* Stereo / Mono Circles Indicator */}
            <div className="my-2 flex flex-col items-center justify-center">
              <div className="relative flex h-14 w-20 items-center justify-center">
                {isMidActive ? (
                  <div className="flex items-center justify-center">
                    <div className="h-9 w-9 rounded-full border-2 border-cyan-400 bg-cyan-400/20 shadow-md shadow-cyan-400/30 transition-all duration-150" />
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center">
                    <div className="h-8 w-8 rounded-full border-2 border-zinc-600 bg-zinc-800/40 -mr-2.5 transition-all duration-150" />
                    <div className="h-8 w-8 rounded-full border-2 border-zinc-600 bg-zinc-800/40 -ml-2.5 transition-all duration-150" />
                  </div>
                )}
              </div>
              <span className="font-mono text-[10px] tracking-wider text-zinc-400">
                {isMidActive ? "MONO" : "STEREO"}
              </span>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => monitorMid.set(isMidActive ? 0 : 1)}
                className={`w-full rounded-md py-2 text-xs font-bold tracking-wide transition ${
                  isMidActive
                    ? "bg-cyan-400 text-black shadow-md shadow-cyan-400/30"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600"
                }`}
              >
                MONITOR MID
              </button>

              <div className="flex items-center justify-between rounded bg-zinc-950/80 px-2 py-1 text-xs">
                <span className="text-[11px] text-zinc-400">Key:</span>
                {learningField === "midKey" ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="Press..."
                    className="w-14 rounded bg-zinc-800 px-1 text-center font-mono text-xs focus:outline-none"
                    style={{ color: "#3280fc" }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      handleKeyLearn("midKey", e.key);
                    }}
                    onBlur={() => setLearningField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setLearningField("midKey")}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-xs font-semibold hover:border-blue-500"
                    style={{ color: "#3280fc" }}
                  >
                    [{keys.midKey.toUpperCase()}]
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

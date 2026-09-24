'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OutOfWorkTabs from '@/components/OutOfWorkTabs';
import {
  DEFAULT_BEATS,
  DEFAULT_BPM,
  LOOKAHEAD_S,
  MAX_BPM,
  METERS,
  MIN_BPM,
  PRESETS,
  STORE_BPM,
  STORE_SETTINGS,
  TAP_MAX_SAMPLES,
  TAP_TIMEOUT_MS,
  TIMER_MS,
  bpmFromTaps,
  clampBpm,
  loadStoredBeats,
  loadStoredBpm,
  markingFor,
} from '@/lib/metronome';
import styles from './Metronome.module.css';

const PlayIcon = () => (
  <svg className={`${styles.icon} ${styles.iconPlay}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
);
const StopIcon = () => (
  <svg className={`${styles.icon} ${styles.iconStop}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>
);

/*
 * Metronome — Web Audio lookahead scheduler.
 *
 * A 25 ms timer schedules clicks up to 120 ms ahead against
 * AudioContext.currentTime, so the audible beat never depends on
 * setTimeout accuracy. The visual flash is derived from the same audio
 * clock, which keeps the picture locked to the sound.
 */
export default function Metronome() {
  // Defaults on both server and client so the first HTML matches, then the
  // stored preferences are applied in the effect below.
  const [bpm, setBpmState] = useState(DEFAULT_BPM);
  const [beats, setBeatsState] = useState(DEFAULT_BEATS);
  const [running, setRunning] = useState(false);
  const [activeBeat, setActiveBeat] = useState(1);
  const [tapFeedback, setTapFeedback] = useState(false);
  const [audioError, setAudioError] = useState('');
  // Scratch text for the number field, so typing "9" on the way to "90"
  // isn't instantly clamped back to 30.
  const [tempoText, setTempoText] = useState(null);

  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const schedulerIdRef = useRef(null);
  const animationIdRef = useRef(null);
  const runningRef = useRef(false);
  const nextBeatTimeRef = useRef(0);
  const startedAtRef = useRef(0);
  const currentBeatRef = useRef(1);
  const tapTimesRef = useRef([]);
  const tapResetRef = useRef(null);

  // ---------- latest values for the audio clock callbacks ----------
  // Refs are never written during render; the effect below keeps them current
  // so the interval/RAF callbacks (which outlive a render) read fresh values.
  const bpmRef = useRef(DEFAULT_BPM);
  const beatsRef = useRef(DEFAULT_BEATS);

  useEffect(() => {
    bpmRef.current = bpm;
    beatsRef.current = beats;
  }, [bpm, beats]);

  // Beat dots are owned by the animation frame, so React never fights it there.
  // The render callback only records the DOM nodes; the effect lights one up.
  const dotRefs = useRef([]);
  const setDotRef = useCallback((index) => (el) => { dotRefs.current[index] = el; }, []);
  const activeClassName = styles.active;

  useEffect(() => {
    dotRefs.current.length = beats;
    const lit = (running ? activeBeat : 1) - 1;
    dotRefs.current.forEach((dot, index) => {
      if (dot) dot.classList.toggle(activeClassName, index === lit);
    });
  }, [running, activeBeat, beats, activeClassName]);

  // ---------- persistence ----------
  // localStorage is an external system, so it is read after mount (reading it
  // during render would desync the server HTML from the first client render)
  // and written back whenever the settings change.
  useEffect(() => {
    const restore = () => {
      const savedBpm = clampBpm(loadStoredBpm());
      const savedBeats = loadStoredBeats();
      if (savedBpm !== null) setBpmState(savedBpm);
      if (savedBeats !== null) setBeatsState(savedBeats);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(restore);
      return () => window.cancelIdleCallback(handle);
    }

    let cancelled = false;
    const handle = window.setTimeout(() => { if (!cancelled) restore(); }, 0);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_BPM, String(bpm));
      localStorage.setItem(STORE_SETTINGS, JSON.stringify({ beats }));
    } catch (e) {
      /* private mode */
    }
  }, [bpm, beats]);

  // ---------- audio ----------
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    return true;
  }, []);

  /*
   * A short FM-blip: a sine with an exponential pitch drop and a fast decay
   * envelope. Downbeats land a fifth higher than the other beats so you can
   * hear where the bar restarts.
   */
  const click = useCallback((time, accent) => {
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1760 : 1175, time);
    osc.frequency.exponentialRampToValueAtTime(accent ? 660 : 440, time + 0.05);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (accent ? 0.13 : 0.09));

    osc.connect(gain);
    gain.connect(masterRef.current);
    osc.start(time);
    osc.stop(time + 0.25);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return; // clock frozen — don't queue a burst
    while (nextBeatTimeRef.current < ctx.currentTime + LOOKAHEAD_S) {
      // One stable callback reads tempo/meter from refs, so the running
      // interval always sees the current settings.
      click(nextBeatTimeRef.current, currentBeatRef.current === 1);
      nextBeatTimeRef.current += 60 / bpmRef.current;
      currentBeatRef.current = currentBeatRef.current >= beatsRef.current
        ? 1
        : currentBeatRef.current + 1;
    }
  }, [click]);

  // Visuals ride the same audio clock the clicks do, so the flash and the
  // sound stay locked together instead of drifting with the frame rate.
  // Held in a ref so the loop can re-schedule itself without a TDZ reference.
  const syncVisualsRef = useRef(() => {});
  useEffect(() => {
    syncVisualsRef.current = () => {
      const ctx = ctxRef.current;
      if (!ctx || !runningRef.current) return;
      const duration = 60 / bpmRef.current;
      const elapsed = ctx.currentTime - startedAtRef.current;
      const beat = elapsed < 0 ? 1 : (Math.floor(elapsed / duration) % beatsRef.current) + 1;
      setActiveBeat(beat);
      animationIdRef.current = requestAnimationFrame(syncVisualsRef.current);
    };
  }, []);

  /* Restart the click stream from a known point in the audio clock. */
  const anchorSchedule = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    nextBeatTimeRef.current = ctx.currentTime + 0.09;
    startedAtRef.current = nextBeatTimeRef.current;
    currentBeatRef.current = 1;
    setActiveBeat(1);
  }, []);

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    setRunning(false);
    window.clearInterval(schedulerIdRef.current);
    schedulerIdRef.current = null;
    window.cancelAnimationFrame(animationIdRef.current);
    animationIdRef.current = null;
    currentBeatRef.current = 1;
    setActiveBeat(1);
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    if (!ensureAudio()) {
      setAudioError('Audio not supported in this browser');
      return;
    }
    const ctx = ctxRef.current;
    // This runs inside the click, so a suspended context may resume here.
    if (ctx.state === 'suspended') ctx.resume();
    setAudioError('');

    runningRef.current = true;
    setRunning(true);
    anchorSchedule();

    scheduler();
    schedulerIdRef.current = window.setInterval(scheduler, TIMER_MS);
    animationIdRef.current = requestAnimationFrame(syncVisualsRef.current);
  }, [anchorSchedule, ensureAudio, scheduler]);

  const toggle = useCallback(() => {
    if (runningRef.current) stop(); else start();
  }, [start, stop]);

  // ---------- tempo + meter ----------
  const changeBpm = useCallback((value) => {
    const next = clampBpm(value);
    if (next === null) return;
    setBpmState(next);
    // Programmatic changes (presets, tap tempo, arrows, slider) also refresh
    // the number field; the only path that leaves stale text behind is blur.
    setTempoText(String(next));
  }, []);

  const changeMeter = useCallback((next) => {
    const value = Number(next);
    if (METERS.indexOf(value) === -1) return;
    setBeatsState(value);
    if (currentBeatRef.current > value) currentBeatRef.current = 1;
  }, []);

  const tapTempo = useCallback(() => {
    const now = window.performance && performance.now ? performance.now() : Date.now();
    const taps = tapTimesRef.current;

    // A long pause starts a fresh measurement.
    if (taps.length && now - taps[taps.length - 1] > TAP_TIMEOUT_MS) taps.length = 0;
    taps.push(now);
    if (taps.length > TAP_MAX_SAMPLES) taps.shift();

    window.clearTimeout(tapResetRef.current);
    tapResetRef.current = window.setTimeout(() => { tapTimesRef.current.length = 0; }, TAP_TIMEOUT_MS);

    const next = bpmFromTaps(taps);
    if (next === null) {
      setTapFeedback(true);
      return;
    }

    changeBpm(next);
    setTapFeedback(false);
  }, [changeBpm]);

  // ---------- keyboard ----------
  useEffect(() => {
    function onKeyDown(event) {
      const tag = (event.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          toggle();
          break;
        case 't':
        case 'T':
          event.preventDefault();
          tapTempo();
          break;
        case 'ArrowUp':
          event.preventDefault();
          changeBpm(bpmRef.current + (event.shiftKey ? 5 : 1));
          break;
        case 'ArrowDown':
          event.preventDefault();
          changeBpm(bpmRef.current - (event.shiftKey ? 5 : 1));
          break;
        case 'ArrowRight':
          event.preventDefault();
          changeBpm(bpmRef.current + 5);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          changeBpm(bpmRef.current - 5);
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          const next = METERS[Number(event.key) - 1];
          if (next) changeMeter(next);
          break;
        }
        default:
          break;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [changeBpm, changeMeter, tapTempo, toggle]);

  // Silence the context in a hidden tab, then re-anchor on return so no
  // queued beats fire all at once.
  useEffect(() => {
    function onVisibility() {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === 'running') ctx.suspend();
      } else if (runningRef.current && ctx.state === 'suspended') {
        ctx.resume().then(anchorSchedule);
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [anchorSchedule]);

  // Cleanup when leaving the page.
  useEffect(() => () => {
    window.clearInterval(schedulerIdRef.current);
    window.clearTimeout(tapResetRef.current);
    window.cancelAnimationFrame(animationIdRef.current);
    const ctx = ctxRef.current;
    if (ctx && ctx.state === 'running') ctx.close();
  }, []);

  // ---------- render ----------
  const dots = Array.from({ length: beats }, (_, i) => i + 1);
  const marking = markingFor(bpm);

  return (
    <main>
      <Navbar active="out-of-work" />
      <OutOfWorkTabs />

      <div className={`${styles.metro} ${running ? styles.playing : ''}`}>
        <header className={styles.pageHead}>
          <h1>Metronome</h1>
          <p>My practice click for guitar — set the tempo, choose the feel, and go.</p>
        </header>

        <div className={styles.tempoCard}>
          <span className={styles.tempoLabel}>Tempo</span>
          <div className={styles.tempoRow}>
            <span className={styles.tempoValue}>{bpm}</span>
            <span className={styles.tempoUnit}>BPM</span>
          </div>
          <p className={styles.tempoSub}>
            Marking: {marking} &middot; {beats}/4 feel
          </p>

          <p className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>{audioError || (running ? 'Playing' : 'Stopped')}</span>
          </p>

          <div className={styles.beats} aria-hidden="true">
            {dots.map((beat) => (
              <span
                key={beat}
                ref={setDotRef(beat - 1)}
                className={[styles.beatDot, beat === 1 ? styles.downbeat : ''].filter(Boolean).join(' ')}
              >
                {beat}
              </span>
            ))}
          </div>
        </div>

        {/*
         * One DOM drives both layouts. Phones flow as a single column
         * (tempo, controls, meter, play, shortcuts); from the desktop
         * breakpoint this becomes a three-column grid of named areas — tempo
         * controls on the left, the big readout and transport in the middle,
         * meter choice on the right — so the eye never leaves the tempo. Key
         * bindings only exist on a keyboard, so they stay hidden on phones.
         */}
        <div className={styles.panel}>
          <div className={`${styles.controls} ${styles.controlsTempo}`}>
            <label className={styles.controlLabel} htmlFor="tempo-slider">Beats per minute</label>
            <div className={styles.sliderRow}>
              <input
                id="tempo-slider"
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                step="1"
                value={bpm}
                onChange={(event) => changeBpm(event.target.value)}
                aria-label="Tempo in beats per minute"
              />
              <input
                type="number"
                min={MIN_BPM}
                max={MAX_BPM}
                step="1"
                value={tempoText === null ? bpm : tempoText}
                onChange={(event) => {
                  const raw = event.target.value;
                  setTempoText(raw);
                  const next = clampBpm(raw);
                  if (next !== null) setBpmState(next);
                }}
                onBlur={() => {
                  if (tempoText === null) return;
                  const next = clampBpm(tempoText);
                  setTempoText(null); // back to rendering the clamped state
                  if (next !== null) setBpmState(next);
                }}
                aria-label="Tempo value"
              />
            </div>

            <div className={styles.presets}>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => changeBpm(preset)}
                  aria-pressed={bpm === preset}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              <button type="button" className="btn-link compact" onClick={tapTempo}>
                {tapFeedback ? 'Tap again…' : 'Tap tempo'}
              </button>
            </div>

            <hr className={`section-rule ${styles.controlsRule}`} />
          </div>

          <div className={`${styles.controls} ${styles.controlsMeter}`}>
            <span className={styles.controlLabel} id="meter-label">Time signature</span>
            <div className={styles.meters} role="radiogroup" aria-labelledby="meter-label">
              {METERS.map((meter) => (
                <label key={meter} className={styles.meterOption}>
                  <input
                    type="radio"
                    name="meter"
                    value={meter}
                    checked={beats === meter}
                    onChange={() => changeMeter(meter)}
                  />
                  <span>{meter}/4</span>
                </label>
              ))}
            </div>
            <p className={styles.fieldHint}>
              The first beat of every bar is accented — that is your downbeat. 6/8 counts six eighth notes.
            </p>
          </div>

          <div className={styles.centerFooter}>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.playBtn}
                onClick={toggle}
                aria-pressed={running}
                disabled={Boolean(audioError)}
              >
                {running ? <StopIcon /> : <PlayIcon />}
                <span>{running ? 'Stop' : 'Start'}</span>
              </button>
            </div>

            <div className={styles.shortcuts}>
              <kbd>Space</kbd> start / stop &nbsp;·&nbsp;
              <kbd>T</kbd> tap tempo &nbsp;·&nbsp;
              <kbd>↑</kbd><kbd>↓</kbd> tempo ±1 &nbsp;·&nbsp;
              <kbd>←</kbd><kbd>→</kbd> tempo ±5 &nbsp;·&nbsp;
              <kbd>1</kbd>–<kbd>4</kbd> time signature
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}

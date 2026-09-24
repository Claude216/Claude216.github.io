'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OutOfWorkTabs from '@/components/OutOfWorkTabs';
import {
  CLICK_VOICES,
  DEFAULT_BEATS,
  DEFAULT_BPM,
  DEFAULT_VOICE,
  DEFAULT_VOLUME,
  GAIN_RAMP_S,
  INITIAL_DELAY_S,
  LOOKAHEAD_S,
  MAX_BPM,
  METERS,
  MIN_BPM,
  PRESETS,
  STORE_BPM,
  STORE_SETTINGS,
  STORE_VOICE,
  STORE_VOLUME,
  TAP_MAX_SAMPLES,
  TAP_TIMEOUT_MS,
  TIMER_MS,
  beatAtListedTime,
  beatInterval,
  bpmFromTaps,
  clampBpm,
  VOLUME_MAX,
  gainFromDb,
  isVoiceId,
  loadStoredBeats,
  loadStoredBpm,
  loadStoredVoice,
  loadStoredVolume,
  markingFor,
  nextBeatState,
  voiceById,
  volumeCurve,
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
  // null means "no beat lit yet" — used during the lead-in before the first click.
  const [activeBeat, setActiveBeat] = useState(1);
  const [tapFeedback, setTapFeedback] = useState(false);
  const [audioError, setAudioError] = useState('');
  // Scratch text for the number field, so typing "9" on the way to "90"
  // isn't instantly clamped back to 30.
  const [tempoText, setTempoText] = useState(null);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  // The meter the clicks are currently using. A change to the picker only takes
  // effect at the next bar line, so the dots follow this until then.
  const [playingBeats, setPlayingBeats] = useState(null);

  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const schedulerIdRef = useRef(null);
  const animationIdRef = useRef(null);
  const runningRef = useRef(false);
  /*
   * The scheduler records when it queued each click and which beat of the bar
   * that was. The visual reads this instead of recomputing a beat from elapsed
   * time — an elapsed-time model silently assumes a constant tempo and an
   * unchanging meter, so changing either mid-playback used to slide the flash
   * away from the sound.
   */
  const beatScheduleRef = useRef({ at: -1, beat: 0, duration: 60 / DEFAULT_BPM });
  const playingBeatsRef = useRef(null);
  // The meter the bar currently being played belongs to. Held for the whole bar
  // so a mid-bar change to the picker cannot shorten a bar already running, then
  // the next bar starts on whatever is selected at that point.
  const barMeterRef = useRef(null);
  // Set when the next beat emitted should open a new bar.
  const barStartRef = useRef(true);
  const lastScheduledAtRef = useRef(0);
  const currentBeatRef = useRef(1);
  const tapTimesRef = useRef([]);
  const tapResetRef = useRef(null);
  // The scheduler runs outside React, so it reads the voice through a ref.
  const voiceRef = useRef(DEFAULT_VOICE);
  const noiseBufferRef = useRef(null);
  // Mirrors the master gain so a volume change can ramp from where it is.
  const volumeRef = useRef(volumeCurve(DEFAULT_VOLUME));

  /*
   * Volume changes ramp over a few milliseconds instead of jumping. A hard jump
   * on a gain node clicks audibly, which is exactly the artefact a metronome
   * must not have.
   */
  const rampVolume = useCallback((target) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const from = Math.max(volumeRef.current, 0.0001);
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(from, now);
    master.gain.exponentialRampToValueAtTime(Math.max(target, 0.0001), now + GAIN_RAMP_S);
    volumeRef.current = target;
  }, []);


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
    // While running, the dots match the meter the clicks are in — otherwise a
    // meter change would shrink the row while the old bar is still sounding, and
    // its remaining beats would light nothing.
    const shown = running && playingBeats ? playingBeats : beats;
    dotRefs.current.length = shown;
    const lit = running ? (activeBeat === null ? -1 : activeBeat - 1) : 0;
    dotRefs.current.forEach((dot, index) => {
      if (dot) dot.classList.toggle(activeClassName, index === lit);
    });
  }, [running, activeBeat, beats, playingBeats, activeClassName]);

  // ---------- persistence ----------
  // localStorage is an external system, so it is read after mount (reading it
  // during render would desync the server HTML from the first client render)
  // and written back whenever the settings change.
  useEffect(() => {
    const restore = () => {
      const savedBpm = clampBpm(loadStoredBpm());
      const savedBeats = loadStoredBeats();
      const savedVoice = loadStoredVoice();
      const savedVolume = loadStoredVolume();
      if (savedBpm !== null) setBpmState(savedBpm);
      if (savedBeats !== null) setBeatsState(savedBeats);
      if (savedVoice !== null) setVoiceId(savedVoice);
      if (savedVolume !== null) setVolume(savedVolume);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(restore);
      return () => window.cancelIdleCallback(handle);
    }

    let cancelled = false;
    const handle = window.setTimeout(() => { if (!cancelled) restore(); }, 0);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, []);

  // Keep the scheduler's view of the voice current, and remember the choice.
  useEffect(() => {
    voiceRef.current = voiceId;
    try {
      localStorage.setItem(STORE_VOICE, voiceId);
    } catch (e) {
      /* private mode */
    }
  }, [voiceId]);

  // Apply and remember the volume. Runs on mount too, but the context does not
  // exist yet then — ensureAudio() seeds the master gain instead.
  useEffect(() => {
    rampVolume(volumeCurve(volume));
    try {
      localStorage.setItem(STORE_VOLUME, String(volume));
    } catch (e) {
      /* private mode */
    }
  }, [volume, rampVolume]);

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
    master.gain.value = volumeRef.current; // honour the saved volume from the start
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;

    // One second of white noise, built once and replayed for the percussive
    // voices (creating a buffer per click would be wasteful and jittery).
    const frames = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBufferRef.current = buffer;

    return true;
  }, []);

  /*
   * One click, synthesised on the spot and queued at an exact audio-clock time.
   *
   * A percussion hit is not a tone that bends — it is a body ringing (inharmonic
   * sine partials) plus a surface being struck (a filtered noise burst). Either
   * part can be absent, which is what makes the voices sound like different
   * objects rather than one beep at different pitches.
   */
  const click = useCallback((time, accent) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const voice = voiceById(voiceRef.current) || voiceById(DEFAULT_VOICE);
    if (!ctx || !master || !voice) return;

    if (voice.noise) {
      const { level, attack, decay, filter } = voice.noise;
      const source = ctx.createBufferSource();
      source.buffer = noiseBufferRef.current;
      const shape = ctx.createBiquadFilter();
      shape.type = filter.type;
      shape.frequency.value = filter.frequency;
      shape.Q.value = filter.q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(gainFromDb(level), time + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      source.connect(shape);
      shape.connect(env);
      env.connect(master);
      source.start(time);
      source.stop(time + decay + 0.02);
    }

    (voice.partials || []).forEach((partial) => {
      const frequency = accent ? partial.frequency * partial.ratio : partial.frequency;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, time);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(gainFromDb(partial.level), time + partial.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, time + partial.decay);
      osc.connect(env);
      env.connect(master);
      osc.start(time);
      osc.stop(time + partial.decay + 0.02);
    });
  }, []);

  /*
   * Queues the next clicks. Stable across renders — the interval is created
   * once when playback starts and would otherwise keep calling an old closure —
   * and it reads tempo/meter from refs, so a change is picked up immediately
   * without restarting the transport.
   */
  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return; // clock frozen — don't queue a burst

    while (lastScheduledAtRef.current + 0.001 < ctx.currentTime + LOOKAHEAD_S) {
      // A bar in progress keeps the meter it began under; a fresh bar picks up
      // whatever the player has selected by the time it starts.
      if (barStartRef.current) barMeterRef.current = beatsRef.current;

      const state = nextBeatState(
        lastScheduledAtRef.current,
        currentBeatRef.current,
        bpmRef.current,
        barMeterRef.current,
      );
      barStartRef.current = state.beat >= state.beatsPerBar;
      click(state.at, state.beat === 1);
      lastScheduledAtRef.current = state.at;
      currentBeatRef.current = state.nextBeat;
      beatScheduleRef.current = state;
      if (state.beatsPerBar !== playingBeatsRef.current) {
        playingBeatsRef.current = state.beatsPerBar;
        setPlayingBeats(state.beatsPerBar);
      }
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

      // Each click stays lit until the clock reaches the one after it, so the
      // flash flips exactly when the next click sounds — whatever the tempo or
      // meter did in between.
      setActiveBeat(beatAtListedTime(beatScheduleRef.current, ctx.currentTime));
      animationIdRef.current = requestAnimationFrame(syncVisualsRef.current);
    };
  }, []);

  /*
   * Point the click stream at a fresh spot in the audio clock: restarting
   * playback, or resuming a context whose clock was frozen by the tab being
   * hidden (otherwise every beat "missed" while suspended would be queued at
   * once). The lead-in also keeps the first click out of the past, since
   * resume() is asynchronous.
   */
  const anchorSchedule = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const firstBeatAt = ctx.currentTime + INITIAL_DELAY_S;
    lastScheduledAtRef.current = firstBeatAt;
    currentBeatRef.current = 1;
    // No beat lit yet: the first click has not sounded. syncVisuals() lights it
    // from the audio clock, the same clock the clicks are queued against.
    barMeterRef.current = null;
    barStartRef.current = true;
    beatScheduleRef.current = { at: -1, beat: 0, duration: beatInterval(bpmRef.current), beatsPerBar: beatsRef.current };
    setActiveBeat(null);
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
    setActiveBeat(1); // back to the idle downbeat
    playingBeatsRef.current = null;
    setPlayingBeats(null);
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
    // The scheduler notices the new meter at the next bar line and begins the
    // bar there; the running bar is left to finish, because a bar is counted in
    // beats and cannot be cut short.
    setBeatsState(value);
  }, []);

  /*
   * Picking a voice previews it immediately — choosing a sound you cannot hear
   * is guesswork. The preview is the downbeat, so it is also obvious which beat
   * carries the accent. This runs inside the click handler, which is what lets
   * a suspended AudioContext resume.
   */
  const changeVoice = useCallback((next) => {
    if (!isVoiceId(next)) return;
    setVoiceId(next);
    voiceRef.current = next;

    if (!ensureAudio()) return;
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    click(ctx.currentTime + 0.03, true);
  }, [click, ensureAudio]);

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

            <span className={styles.controlLabel} id="voice-label">Click sound</span>
            <div className={styles.voices} role="radiogroup" aria-labelledby="voice-label">
              {CLICK_VOICES.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  role="radio"
                  aria-checked={voiceId === voice.id}
                  className={`${styles.voiceOption} ${voiceId === voice.id ? styles.voiceOptionActive : ''}`}
                  onClick={() => changeVoice(voice.id)}
                >
                  {voice.label}
                </button>
              ))}
            </div>
            <p className={styles.fieldHint}>
              {voiceById(voiceId)?.description || ''} — tapping a name plays it.
            </p>
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

          <div className={styles.volume}>
            <label className={styles.controlLabel} htmlFor="volume-slider">
              <svg className={styles.volumeIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4zM14 3.2v2.1c2.9.9 5 3.6 5 6.7s-2.1 5.8-5 6.7v2.1c4-1 7-4.6 7-8.8s-3-7.8-7-8.8z" />
              </svg>
              Volume
            </label>
            <div className={styles.sliderRow}>
              <input
                id="volume-slider"
                type="range"
                min="0"
                max={VOLUME_MAX}
                step="1"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Output volume"
                aria-valuetext={`${volume}%`}
              />
              <span className={styles.volumeValue}>{volume}%</span>
            </div>
            <p className={styles.fieldHint}>
              Clicks only — your guitar is not affected.
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

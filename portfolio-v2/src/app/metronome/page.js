import Metronome from '@/components/Metronome';

export const metadata = {
  title: 'Metronome - Lunxiao (Claude) Li',
  description: 'A practice metronome for guitar — adjustable tempo from 30 to 280 BPM, 2/4, 3/4, 4/4 and 6/8, tap tempo and keyboard shortcuts.',
};

export default function MetronomePage() {
  // A flex column so the metronome's own palette can fill the height above the
  // footer instead of leaving a band of the site's background.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Metronome />
    </div>
  );
}

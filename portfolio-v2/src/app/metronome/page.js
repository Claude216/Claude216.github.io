import Metronome from '@/components/Metronome';

export const metadata = {
  title: 'Metronome - Lunxiao (Claude) Li',
  description: 'A practice metronome for guitar — adjustable tempo from 30 to 280 BPM, 2/4, 3/4, 4/4 and 6/8, tap tempo and keyboard shortcuts.',
};

export default function MetronomePage() {
  return <Metronome />;
}

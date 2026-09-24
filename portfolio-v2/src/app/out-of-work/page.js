import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import OutOfWorkTabs from '@/components/OutOfWorkTabs';
import styles from './out-of-work.module.css';

export const metadata = {
  title: 'Out Of Work - Lunxiao (Claude) Li',
  description: "Things Lunxiao (Claude) Li plays with outside working time — small tools and experiments, starting with a guitar practice metronome.",
};

export default function OutOfWorkPage() {
  return (
    <main>
      <Navbar active="out-of-work" />

      <header className="page-head">
        <p className="eyebrow">Out Of Work</p>
        <h1>Here are something I&apos;ve been playing with out of working time.</h1>
        <p className="lead">
          Off-hours experiments — mostly small tools I build because I want to use them myself.
          Grab one from the tab below.
        </p>
      </header>

      <OutOfWorkTabs />

      <section style={{ padding: '48px 0 72px' }}>
        <div className="container">
          <div className={styles.grid}>
            <Link className={styles.card} href="/metronome">
              <h3>
                <span className={styles.beatGlyph} aria-hidden="true"><span /><span /><span /><span /></span>
                Metronome
                <span className={styles.arrow} aria-hidden="true">&rarr;</span>
              </h3>
              <p>
                A steady click for guitar practice — dial the tempo from 30 to 280 BPM,
                pick 2/4, 3/4, 4/4 or 6/8, and use tap tempo when a song sets the pace.
              </p>
            </Link>
          </div>
          <p className="panel-note">More to come — this page is where the non-work stuff will pile up.</p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

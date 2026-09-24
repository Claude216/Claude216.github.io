import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Education from '@/components/Education';
import Publications from '@/components/Publications';
import Experience from '@/components/Experience';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';

/*
 * Sections supply their own <section class="section"> + .container wrappers
 * (Hero renders both the gradient hero and the About section), so no extra
 * layout wrapper is needed here.
 */
export default function Home() {
  return (
    <main>
      <Navbar transparent />
      <Hero />
      <Education />
      <Publications />
      <Experience />
      <Contact />
      <Footer />
    </main>
  );
}

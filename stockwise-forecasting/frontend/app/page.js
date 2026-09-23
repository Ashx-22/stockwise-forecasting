'use client';

import Nav from '../components/Nav.js';
import Hero from '../components/Hero.js';
import Marquee from '../components/Marquee.js';
import HowItWorks from '../components/HowItWorks.js';
import Explorer from '../components/Explorer.js';
import Validation from '../components/Validation.js';
import Impact from '../components/Impact.js';
import Monitoring from '../components/Monitoring.js';
import Notes from '../components/Notes.js';
import CtaBanner from '../components/CtaBanner.js';
import TryIt from '../components/TryIt.js';
import Footer from '../components/Footer.js';
import { DataContext, useLoadData } from '../lib/data.js';

export default function Page() {
  const state = useLoadData();
  return (
    <DataContext.Provider value={state}>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <HowItWorks />
        <Explorer />
        <Validation />
        <Impact />
        <Monitoring />
        <Notes />
        <CtaBanner />
        <TryIt />
      </main>
      <Footer />
      {state.error ? <div className="load-error" role="alert">Could not load the forecast data: {state.error}. Run the backend pipeline or check public/data.</div> : null}
    </DataContext.Provider>
  );
}

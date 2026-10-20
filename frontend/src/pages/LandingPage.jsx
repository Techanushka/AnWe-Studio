import ScrollProgress from "../components/landing/ScrollProgress.jsx";
import Navbar from "../components/landing/Navbar.jsx";
import Hero from "../components/landing/Hero.jsx";
import Marquee from "../components/landing/Marquee.jsx";
import Features from "../components/landing/Features.jsx";
import FinalCta from "../components/landing/FinalCta.jsx";
import Footer from "../components/landing/Footer.jsx";

export default function LandingPage() {
  return (
    <div className="lp">
      <ScrollProgress />
      <div className="orb o1" />
      <div className="orb o2" />
      <Navbar />
      <Hero />
      <Marquee />
      <Features />
      <FinalCta />
      <Footer />
    </div>
  );
}

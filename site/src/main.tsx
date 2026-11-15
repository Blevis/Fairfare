import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { ROUTES, href, useRoute } from "./lib/router";
import { Home } from "./pages/Home";
import { PredictPage } from "./pages/PredictPage";
import { Methodology } from "./pages/Methodology";
import { DataPage } from "./pages/DataPage";
import { ModelPage } from "./pages/ModelPage";
import { Results } from "./pages/Results";
import { Analytics } from "./pages/Analytics";
import { About } from "./pages/About";

const PAGES: Record<string, () => React.JSX.Element> = {
  "/": Home, "/predict": PredictPage, "/methodology": Methodology, "/data": DataPage, "/model": ModelPage,
  "/results": Results, "/analytics": Analytics, "/about": About,
};

function App() {
  const path = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    const label = ROUTES.find((r) => r.path === path)?.label;
    document.title = path === "/" ? "Fairfare · NYC taxi fares, predicted at booking" : `${label} · Fairfare`;
  }, [path]);
  const Page = PAGES[path] ?? Home;
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="top">
        <div className="wrap">
          <a className="brand" href={href("/")}><img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" width={30} height={30} />Fairfare</a>
          <button className="menu-btn" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>Menu</button>
          <nav id="nav" className={`main${open ? " open" : ""}`} aria-label="Main">
            {ROUTES.map((r) => <a key={r.path} href={href(r.path)} aria-current={r.path === path ? "page" : undefined}>{r.label}</a>)}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} key={path}><Page /></main>
      <footer className="bottom">
        <div className="wrap">
          <span>Fairfare · Project 1, Task A “The Fare” · Blevis Allushi, Geri Belba, Leandra Latifi</span>
          <span>Data: NYC TLC yellow-taxi trip records, May–July 2026 sample · <a href="https://github.com/Blevis/Fairfare">Source on GitHub</a></span>
        </div>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

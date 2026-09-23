import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import App from "./App";
import { About } from "./pages";

// HashRouter, not BrowserRouter: static hosting (Pages subpath + Vercel)
// serves a single index.html with no server rewrites, so path URLs would
// 404 and relative asset paths would break under /chat. Hash routes keep
// ./assets/... resolving everywhere with zero server config.
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <main key={location.pathname + location.hash} className="route-enter">
      <Routes>
        <Route path="/" element={<App namespace="home" />} />
        <Route path="/chat" element={<App namespace="chat" />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<App namespace="home" />} />
      </Routes>
    </main>
  );
}

console.log(`[Luca] build ${__BUILD_ID__}`);
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <AnimatedRoutes />
    </HashRouter>
  </React.StrictMode>
);

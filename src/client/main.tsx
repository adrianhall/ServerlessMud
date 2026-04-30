/**
 * React application entry point.
 *
 * Mounts the root `<App />` component into the DOM element with id "root"
 * defined in `index.html`.
 *
 * @module
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import React from "react";
import { createRoot } from "react-dom/client";
import { RangeWorkspace } from "./estimated/RangeWorkspace.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RangeWorkspace />
  </React.StrictMode>,
);

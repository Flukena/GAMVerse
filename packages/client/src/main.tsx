import React from "react";
import { createRoot } from "react-dom/client";
import { OfficeApp } from "./ui/OfficeApp";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OfficeApp />
  </React.StrictMode>,
);


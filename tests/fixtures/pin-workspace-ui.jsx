import React from "react";
import { createRoot } from "react-dom/client";
import PinPublishingWorkspace from "../../src/components/PinPublishingWorkspace";
import "../../src/index.css";
createRoot(document.getElementById("root")).render(
  <main className="p-4 max-w-7xl mx-auto">
    <PinPublishingWorkspace
      settings={{ pinterestBoards: ["Recipes"] }}
      setActiveScreen={() => {}}
    />
  </main>,
);

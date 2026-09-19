import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
} else {
  console.error("ReactION: #root element not found");
}

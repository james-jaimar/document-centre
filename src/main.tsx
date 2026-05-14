import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installStorefrontTenantHeader } from "./lib/storefrontTenantHeader";

installStorefrontTenantHeader();

createRoot(document.getElementById("root")!).render(<App />);

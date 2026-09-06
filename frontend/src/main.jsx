import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import AutoMessageScroll from "./components/AutoMessageScroll.jsx";
import App from "./App.jsx";
import AuthenticatedPrivateDMFeature from "./components/AuthenticatedPrivateDMFeature.jsx";
import DirectMessageNotifier from "./components/DirectMessageNotifier.jsx";
import DirectMessageNotificationBridge from "./components/DirectMessageNotificationBridge.jsx";
import DirectMessageNotificationCenter from "./components/DirectMessageNotificationCenter.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AutoMessageScroll>
      <App />
    </AutoMessageScroll>
    <AuthenticatedPrivateDMFeature />
    <DirectMessageNotifier />
    <DirectMessageNotificationBridge />
    <DirectMessageNotificationCenter />
  </StrictMode>,
);

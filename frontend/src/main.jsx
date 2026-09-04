import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import AutoMessageScroll from "./AutoMessageScroll.jsx";
import AppEdit from "./AppEdit.jsx";
import PrivateDMFeature from "./components/PrivateDMFeature.jsx";
import DirectMessageNotifier from "./components/DirectMessageNotifier.jsx";
import DirectMessageNotificationBridge from "./components/DirectMessageNotificationBridge.jsx";
import DirectMessageNotificationCenter from "./components/DirectMessageNotificationCenter.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AutoMessageScroll>
      <AppEdit />
    </AutoMessageScroll>
    <PrivateDMFeature />
    <DirectMessageNotifier />
    <DirectMessageNotificationBridge />
    <DirectMessageNotificationCenter />
  </StrictMode>,
);

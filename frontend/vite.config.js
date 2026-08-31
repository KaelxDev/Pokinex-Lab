import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function poknexMessageOrder() {
  return {
    name: "poknex-message-order",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/AppFixed.jsx")) return null;
      if (!code.includes("{messages.map((message, index) =>")) return null;

      const helper = `\nfunction sortMessagesChronologically(items) {\n  return items\n    .map((item, index) => ({ item, index }))\n    .sort((a, b) => {\n      const aTime = a.item?.timestamp ? new Date(a.item.timestamp).getTime() : Number.MAX_SAFE_INTEGER;\n      const bTime = b.item?.timestamp ? new Date(b.item.timestamp).getTime() : Number.MAX_SAFE_INTEGER;\n      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.index - b.index;\n      if (Number.isNaN(aTime)) return 1;\n      if (Number.isNaN(bTime)) return -1;\n      return aTime === bTime ? a.index - b.index : aTime - bTime;\n    })\n    .map(({ item }) => item);\n}\n`;

      let transformed = code.replace("function App() {", `${helper}\nfunction App() {`);
      transformed = transformed.replace(
        "  const displayName = profile?.displayName || user.displayName || user.username, avatar = profile?.avatar || \"\";",
        "  const displayName = profile?.displayName || user.displayName || user.username, avatar = profile?.avatar || \"\";\n  const orderedMessages = sortMessagesChronologically(messages);"
      );
      transformed = transformed.replace("{messages.map((message, index) =>", "{orderedMessages.map((message, index) =>");
      transformed = transformed.replace(
        "const previousMessage = messages[index - 1], nextMessage = messages[index + 1]",
        "const previousMessage = orderedMessages[index - 1], nextMessage = orderedMessages[index + 1]"
      );

      return { code: transformed, map: null };
    },
  };
}

export default defineConfig({
  plugins: [poknexMessageOrder(), react()],
});

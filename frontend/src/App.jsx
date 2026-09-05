import { logout as logoutRequest } from "./services/auth";
import AuthScreen from "./components/AuthScreen";
import ChatWorkspace from "./components/ChatWorkspace.jsx";
import { ChatProvider } from "./context/ChatContext";
import { useAuthSession } from "./hooks/useAuthSession";

export default function App() {
  const { authChecked, user, syncUser, logout } = useAuthSession();

  async function handleLogout() {
    try {
      await logoutRequest();
    } catch (error) {
      console.error("Não foi possível encerrar a sessão no servidor:", error);
    } finally {
      logout();
    }
  }

  if (!authChecked) {
    return (
      <main className="app">
        <section className="login">
          <h1>💬 Poknex</h1>
          <div className="status connecting">🟡 Verificando sessão...</div>
        </section>
      </main>
    );
  }

  if (!user) return <AuthScreen onAuthenticated={syncUser} />;

  return (
    <ChatProvider
      user={user}
      syncUser={syncUser}
      onAuthenticationRequired={logout}
    >
      <ChatWorkspace onLogout={handleLogout} />
    </ChatProvider>
  );
}

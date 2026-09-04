import { useState } from "react";
import { login, register } from "../services/auth";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const currentUser = mode === "login" ? await login(username, password) : await register(username, password);
      onAuthenticated(currentUser);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((current) => (current === "login" ? "register" : "login"));
    setError("");
  }

  return (
    <main className="app auth-page">
      <section className="auth-layout">
        <div className="auth-visual">
          <div className="auth-visual-brand">
            <img src="/icone.png?v=2" alt="Pokinex" />
            <span>Pokinex</span>
          </div>
          <div className="auth-visual-copy">
            <span className="auth-kicker">CHAT • COMMUNITY • DIVERSÃO</span>
            <h1>Converse em tempo real.</h1>
            <p>Um espaço simples para conversar, compartilhar ideias e se conectar com outras pessoas.</p>
          </div>
          <div className="auth-visual-foot">
            <span className="auth-visual-line" />
            <span>PKX / 01</span>
          </div>
        </div>

        <section className="login">
          <div className="auth-form-head">
            <span className="auth-form-label">{mode === "login" ? "BEM-VINDO DE VOLTA" : "NOVO POR AQUI"}</span>
            <h2>{mode === "login" ? "Entrar no Pokinex" : "Criar sua conta"}</h2>
            <p>{mode === "login" ? "Acesse suas conversas e continue de onde parou." : "Crie uma identidade e entre na conversa."}</p>
          </div>

          <div className="auth-live-row">
            <span className="auth-status-dot" />
            <span>Serviço operacional</span>
          </div>

          {error && <div className="status disconnected">{error}</div>}

          <form className="login-form" onSubmit={submit}>
            <label className="auth-field">
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="seu_username" minLength={3} maxLength={20} autoComplete="username" autoFocus />
            </label>
            <label className="auth-field">
              <span>Senha</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Sua senha" minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </label>
            <button className="auth-submit" type="submit" disabled={loading}>
              <span>{loading ? "Entrando..." : mode === "login" ? "Entrar" : "Criar conta"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <div className="auth-divider"><span /><small>{mode === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}</small><span /></div>
          <button className="auth-switch" type="button" onClick={switchMode}>{mode === "login" ? "Criar conta" : "Voltar para entrar"}</button>
        </section>
      </section>
    </main>
  );
}

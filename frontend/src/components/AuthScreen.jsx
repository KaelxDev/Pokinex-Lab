import { useState } from "react";
import { login, register } from "../services/auth";

const capabilityStyle = {
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "10px 11px",
  border: "1px solid rgba(255,255,255,.055)",
  borderRadius: 11,
  background: "rgba(255,255,255,.02)",
  color: "#8a919e",
  textAlign: "left",
  boxSizing: "border-box",
};

const capabilityIconStyle = {
  width: 28,
  height: 28,
  flex: "0 0 28px",
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "rgba(255,255,255,.04)",
  fontSize: 14,
};

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
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
    setNotice("");
  }

  function showPrivateMessagesNotice() {
    setError("");
    setNotice("Mensagens privadas estão disponíveis depois que você entrar na sua conta.");
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
            <p>Um espaço simples para conversar em público, trocar ideias e enviar mensagens privadas.</p>
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
            <p>{mode === "login" ? "Entre na sua conta para conversar em tempo real." : "Crie sua conta para começar a usar o Pokinex."}</p>
          </div>

          <div className="auth-live-row">
            <span className="auth-status-dot" />
            <span>Serviço operacional</span>
          </div>

          {error && <div className="status disconnected">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 16 }} aria-label="Recursos do Pokinex">
            <div style={capabilityStyle}>
              <span style={capabilityIconStyle} aria-hidden="true">💬</span>
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dce0e7", fontSize: 10 }}>Chat público</strong>
                <small style={{ color: "#626976", fontSize: 9 }}>Converse em tempo real</small>
              </span>
            </div>
            <button
              type="button"
              onClick={showPrivateMessagesNotice}
              style={{
                ...capabilityStyle,
                cursor: "pointer",
                font: "inherit",
              }}
              onMouseOver={(event) => {
                event.currentTarget.style.background = "rgba(88,101,242,.08)";
                event.currentTarget.style.borderColor = "rgba(88,101,242,.18)";
              }}
              onMouseOut={(event) => {
                event.currentTarget.style.background = "rgba(255,255,255,.02)";
                event.currentTarget.style.borderColor = "rgba(255,255,255,.055)";
              }}
              aria-label="Mensagens privadas"
            >
              <span style={capabilityIconStyle} aria-hidden="true">✉</span>
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#dce0e7", fontSize: 10 }}>Mensagens privadas</strong>
                <small style={{ color: "#626976", fontSize: 9 }}>Converse diretamente</small>
              </span>
              <span style={{ flex: "0 0 auto", color: "#707785", fontSize: 17 }} aria-hidden="true">›</span>
            </button>
          </div>

          <div className="auth-divider"><span /><small>{mode === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}</small><span /></div>
          <button className="auth-switch" type="button" onClick={switchMode}>{mode === "login" ? "Criar conta" : "Voltar para entrar"}</button>
        </section>
      </section>
    </main>
  );
}

import { createRoot } from "react-dom/client";
import { Component, ReactNode } from "react";
import App from "./App.tsx";
import "./index.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#0E0C0A", color: "#F2F2F4", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}></div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Erreur au chargement</div>
            <div style={{ fontSize: 13, color: "#9194A0", marginBottom: 16 }}>
              {this.state.error.message}
            </div>
            <div style={{ fontSize: 11, color: "#555866", background: "#1E1A16", borderRadius: 4, padding: 12, textAlign: "left", fontFamily: "monospace", wordBreak: "break-all" }}>
              {this.state.error.stack?.slice(0, 300)}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

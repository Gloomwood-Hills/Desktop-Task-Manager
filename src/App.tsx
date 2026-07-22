function App() {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      fontFamily: "sans-serif",
      color: "#ffffff",
    }}>
      {/* Drag handle area */}
      <div
        data-tauri-drag-region
        style={{
          width: "100%",
          height: "32px",
          background: "rgba(255, 255, 255, 0.06)",
          flexShrink: 0,
          userSelect: "none",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
          Desktop Task Manager
        </span>
      </div>

      {/* Content area with glass effect */}
      <div style={{
        flex: 1,
        background: "rgba(30, 30, 46, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "0 0 12px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>Desktop Task Manager</h1>
        <p style={{ color: "#34C759" }}>WorkerW Layer - Phase 3</p>
      </div>
    </div>
  );
}

export default App;
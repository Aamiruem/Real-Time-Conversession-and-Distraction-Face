// Shown while an app page's code loads (client-side navigation stays instant on revisits).
export default function Loading() {
  return (
    <div className="dash" aria-busy="true" aria-label="Loading">
      <div className="card skeleton" style={{ height: 120 }} />
      <div className="grid g2">
        <div className="card skeleton" style={{ height: 260 }} />
        <div className="card skeleton" style={{ height: 260 }} />
      </div>
    </div>
  );
}

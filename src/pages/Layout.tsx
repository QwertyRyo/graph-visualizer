import { NavLink, Outlet } from "react-router";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm ${isActive ? "bg-slate-200 font-medium" : "hover:bg-slate-100"}`;

export function Layout() {
  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
        <NavLink to="/" className="font-semibold">
          Graph Visualizer
        </NavLink>
        <nav className="flex gap-1">
          <NavLink to="/" end className={linkClass}>
            Editor
          </NavLink>
          <NavLink to="/graphs" className={linkClass}>
            My graphs
          </NavLink>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

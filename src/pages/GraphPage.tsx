import { useParams } from "react-router";

// placeholder until saved graphs arrive in part d
export function GraphPage() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">Graph {id}</h1>
      <p className="mt-2 text-slate-600">Saved graphs are coming soon.</p>
    </div>
  );
}

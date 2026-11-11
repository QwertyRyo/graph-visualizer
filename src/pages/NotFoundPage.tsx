import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">Not found</h1>
      <Link to="/" className="mt-4 inline-block text-accent-strong hover:underline">
        Go home
      </Link>
    </div>
  );
}

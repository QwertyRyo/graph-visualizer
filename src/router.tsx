import { createBrowserRouter, Navigate } from "react-router";
import { EditorPage } from "./pages/EditorPage";
import { GraphPage } from "./pages/GraphPage";
import { GraphsPage } from "./pages/GraphsPage";
import { Layout } from "./pages/Layout";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <EditorPage /> },
      { path: "editor", element: <Navigate to="/" replace /> },
      { path: "g/:id", element: <GraphPage /> },
      { path: "graphs", element: <GraphsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

import { createBrowserRouter, Navigate } from "react-router";
import { EditorPage } from "./pages/EditorPage";
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
      { path: "graphs", element: <GraphsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

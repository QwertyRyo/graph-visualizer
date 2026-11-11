# Work in Progress Graph Visualizer

**Try it:** https://graph-visualizer-197db.web.app


Draw graphs in the browser and step through classic graph algorithms one move at a time to visualize how they work.

- **Edit:** add vertices and edges, drag them around, set colours, weights and a root vertex, and switch between directed and undirected graphs.
- **Run algorithms:** Visualize the processes in the DFS, BFS, Dijkstra, Prim and Kruskal algorithms, played step by step or automatically on the canvas.
- **Filter:** highlight parts of the graph without editing it.
- **Import and export:** Graphviz DOT, GraphML and GraphSON files.
- **Save:** Account functionality with Github, Google and email/password sign-in.

Built with React, TypeScript, Vite, Tailwind CSS, Cytoscape.js and Firebase (Authentication and Cloud Firestore).

## Running locally

You need Node.js 24, the [Firebase CLI](https://firebase.google.com/docs/cli) and Java 21 or newer for the Firebase emulators.

```sh
npm install
npm run emulators   # terminal 1: local Auth and Firestore
npm run dev         # terminal 2: the app at http://localhost:5173
```


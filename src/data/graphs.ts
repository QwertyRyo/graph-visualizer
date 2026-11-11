import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc as docRef,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { parseGraphDoc, type GraphDoc } from "../domain/graph/schema";
import { db } from "./firebase";

// both limits are enforced again by firestore.rules
export const MAX_TITLE_LENGTH = 120;
export const MAX_DATA_LENGTH = 900_000;

export type GraphSummary = { id: string; title: string; updatedAt: Date | null };
export type SavedGraph = GraphSummary & { doc: GraphDoc };

export class GraphTooLargeError extends Error {
  constructor() {
    super("This graph is too large to save.");
    this.name = "GraphTooLargeError";
  }
}

export class GraphNotFoundError extends Error {
  constructor() {
    super("This graph doesn't exist, or it belongs to someone else.");
    this.name = "GraphNotFoundError";
  }
}

const graphs = collection(db, "graphs");

function cleanTitle(title: string): string {
  return title.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled graph";
}

function serialise(doc: GraphDoc): string {
  const data = JSON.stringify(doc);
  if (data.length > MAX_DATA_LENGTH) throw new GraphTooLargeError();
  return data;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// a missing graph and someone else's graph both read as permission-denied
function notFoundIfDenied(err: unknown): never {
  if (err instanceof FirebaseError && err.code === "permission-denied") throw new GraphNotFoundError();
  throw err;
}

export async function createGraph(ownerId: string, title: string, doc: GraphDoc): Promise<string> {
  const ref = await addDoc(graphs, {
    ownerId,
    title: cleanTitle(title),
    data: serialise(doc),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveGraph(id: string, title: string, doc: GraphDoc): Promise<void> {
  await updateDoc(docRef(graphs, id), { title: cleanTitle(title), data: serialise(doc), updatedAt: serverTimestamp() }).catch(
    notFoundIfDenied,
  );
}

export async function renameGraph(id: string, title: string): Promise<void> {
  await updateDoc(docRef(graphs, id), { title: cleanTitle(title), updatedAt: serverTimestamp() }).catch(notFoundIfDenied);
}

export async function loadGraph(id: string): Promise<SavedGraph> {
  const snap = await getDoc(docRef(graphs, id)).catch(notFoundIfDenied);
  if (!snap.exists()) throw new GraphNotFoundError();
  const data = snap.data();
  return {
    id,
    title: String(data.title),
    updatedAt: toDate(data.updatedAt),
    doc: parseGraphDoc(JSON.parse(String(data.data))),
  };
}

// newest first; the query must filter by owner or the rules refuse it
export async function listGraphs(ownerId: string): Promise<GraphSummary[]> {
  const snap = await getDocs(query(graphs, where("ownerId", "==", ownerId), orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, title: String(d.data().title), updatedAt: toDate(d.data().updatedAt) }));
}

export async function deleteGraph(id: string): Promise<void> {
  await deleteDoc(docRef(graphs, id)).catch(notFoundIfDenied);
}

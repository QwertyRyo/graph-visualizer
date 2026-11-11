import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";

const OWNER = "alice";
const OTHER = "bob";
const SEEDED = "seeded";

let env: RulesTestEnvironment;

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const valid = (ownerId = OWNER) => ({
  ownerId,
  title: "My graph",
  data: '{"version":1}',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-graph-visualizer",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

test.afterAll(async () => {
  await env?.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "graphs", SEEDED), {
      ownerId: OWNER,
      title: "Seeded",
      data: '{"version":1}',
      createdAt: Timestamp.fromMillis(0),
      updatedAt: Timestamp.fromMillis(0),
    });
  });
});

test.describe("create", () => {
  test("the owner can create a valid graph", async () => {
    await assertSucceeds(addDoc(collection(as(OWNER), "graphs"), valid()));
  });

  test("signed-out users cannot create", async () => {
    await assertFails(addDoc(collection(anon(), "graphs"), valid()));
  });

  test("cannot create a graph owned by someone else", async () => {
    await assertFails(addDoc(collection(as(OWNER), "graphs"), valid(OTHER)));
  });

  test("every field is required", async () => {
    for (const field of ["ownerId", "title", "data", "createdAt", "updatedAt"] as const) {
      const graph: Record<string, unknown> = valid();
      delete graph[field];
      await assertFails(addDoc(collection(as(OWNER), "graphs"), graph));
    }
  });

  test("no extra fields", async () => {
    await assertFails(addDoc(collection(as(OWNER), "graphs"), { ...valid(), isAdmin: true }));
  });

  test("fields must have the right types", async () => {
    const db = as(OWNER);
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), title: 5 }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), data: { version: 1 } }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), createdAt: "today" }));
  });

  test("title must be 1 to 120 characters and not blank", async () => {
    const db = as(OWNER);
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), title: "" }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), title: "   " }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), title: "x".repeat(121) }));
    await assertSucceeds(addDoc(collection(db, "graphs"), { ...valid(), title: "x".repeat(120) }));
  });

  test("data is capped at 900000 characters", async () => {
    const db = as(OWNER);
    await assertSucceeds(addDoc(collection(db, "graphs"), { ...valid(), data: "x".repeat(900_000) }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), data: "x".repeat(900_001) }));
  });

  test("timestamps must be the server's time", async () => {
    const db = as(OWNER);
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), createdAt: Timestamp.fromMillis(0) }));
    await assertFails(addDoc(collection(db, "graphs"), { ...valid(), updatedAt: Timestamp.fromMillis(0) }));
  });
});

test.describe("get", () => {
  test("only the owner can read a graph", async () => {
    await assertSucceeds(getDoc(doc(as(OWNER), "graphs", SEEDED)));
    await assertFails(getDoc(doc(as(OTHER), "graphs", SEEDED)));
    await assertFails(getDoc(doc(anon(), "graphs", SEEDED)));
  });

  test("a missing graph is denied, not empty", async () => {
    await assertFails(getDoc(doc(as(OWNER), "graphs", "missing")));
  });
});

test.describe("list", () => {
  test("the app's query for your own graphs is allowed", async () => {
    const db = as(OWNER);
    const snap = await assertSucceeds(
      getDocs(query(collection(db, "graphs"), where("ownerId", "==", OWNER), orderBy("updatedAt", "desc"))),
    );
    expect(snap.docs.map((d) => d.id)).toEqual([SEEDED]);
  });

  test("unfiltered or someone else's lists are denied", async () => {
    await assertFails(getDocs(collection(as(OWNER), "graphs")));
    await assertFails(getDocs(query(collection(as(OTHER), "graphs"), where("ownerId", "==", OWNER))));
    await assertFails(getDocs(query(collection(anon(), "graphs"), where("ownerId", "==", OWNER))));
  });
});

test.describe("update", () => {
  const ref = (db: Firestore) => doc(db, "graphs", SEEDED);

  test("the owner can save and rename", async () => {
    const db = as(OWNER);
    await assertSucceeds(updateDoc(ref(db), { title: "Renamed", data: '{"version":1,"nodes":[]}', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(db), { title: "Renamed again", updatedAt: serverTimestamp() }));
  });

  test("others cannot update", async () => {
    await assertFails(updateDoc(ref(as(OTHER)), { title: "Mine now", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(anon()), { title: "Mine now", updatedAt: serverTimestamp() }));
  });

  test("ownerId and createdAt cannot change", async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(ref(db), { ownerId: OTHER, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  test("updatedAt must be refreshed to the server's time", async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(ref(db), { title: "No timestamp" }));
    await assertFails(updateDoc(ref(db), { title: "Old timestamp", updatedAt: Timestamp.fromMillis(5) }));
  });

  test("an update cannot break the schema", async () => {
    const db = as(OWNER);
    await assertFails(updateDoc(ref(db), { title: deleteField(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { extra: 1, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { title: "", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { data: "x".repeat(900_001), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { data: 42, updatedAt: serverTimestamp() }));
  });
});

test.describe("delete", () => {
  test("only the owner can delete", async () => {
    await assertFails(deleteDoc(doc(as(OTHER), "graphs", SEEDED)));
    await assertFails(deleteDoc(doc(anon(), "graphs", SEEDED)));
    await assertSucceeds(deleteDoc(doc(as(OWNER), "graphs", SEEDED)));
  });
});

test("every other collection is closed", async () => {
  const db = as(OWNER);
  await assertFails(setDoc(doc(db, "users", OWNER), { name: "Alice" }));
  await assertFails(getDoc(doc(db, "users", OWNER)));
  await assertFails(setDoc(doc(db, "graphs", SEEDED, "versions", "v1"), { data: "{}" }));
});

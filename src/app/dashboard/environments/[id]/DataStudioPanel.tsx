"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Textarea } from "@/components/ui";

type TableMeta = { name: string; label: string };
type KeyPart = { name: string; type: "HASH" | "RANGE" };
type Item = Record<string, unknown>;

/** Browse, query, and edit the environment's DynamoDB tables in the dashboard. */
export default function DataStudioPanel({ environmentId }: { environmentId: string }) {
  const [tables, setTables] = useState<TableMeta[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [keySchema, setKeySchema] = useState<KeyPart[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // query box
  const [statement, setStatement] = useState("");
  const [queryMode, setQueryMode] = useState(false);

  // editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorJson, setEditorJson] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/environments/${environmentId}/data`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setTables(d.tables ?? []);
        if (d.tables?.[0]) setActive(d.tables[0].name);
      });
  }, [environmentId]);

  const loadTable = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    setQueryMode(false);
    const res = await fetch(
      `/api/environments/${environmentId}/data?table=${encodeURIComponent(active)}`,
      { cache: "no-store" }
    );
    setBusy(false);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Couldn't load the table.");
      setItems([]);
      return;
    }
    setKeySchema(d.keySchema ?? []);
    setItems(d.items ?? []);
    setSimulated(Boolean(d.simulated));
    if (!statement) setStatement(`SELECT * FROM "${active}" WHERE `);
  }, [environmentId, active, statement]);

  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function runQuery() {
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await fetch(`/api/environments/${environmentId}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "query", statement }),
    });
    setBusy(false);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Query failed.");
      return;
    }
    setItems(d.items ?? []);
    setSimulated(Boolean(d.simulated));
    setQueryMode(true);
  }

  async function saveItem() {
    setEditorError(null);
    let parsed: Item;
    try {
      parsed = JSON.parse(editorJson) as Item;
    } catch {
      setEditorError("That isn't valid JSON.");
      return;
    }
    for (const k of keySchema) {
      if (parsed[k.name] === undefined) {
        setEditorError(`The item needs its ${k.type === "HASH" ? "partition" : "sort"} key: "${k.name}".`);
        return;
      }
    }
    setBusy(true);
    const res = await fetch(`/api/environments/${environmentId}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "put", table: active, item: parsed }),
    });
    setBusy(false);
    const d = await res.json();
    if (!res.ok) {
      setEditorError(d.error ?? "Save failed.");
      return;
    }
    setEditorOpen(false);
    setNote(d.note ?? "Item saved.");
    loadTable();
  }

  async function removeItem(item: Item) {
    const key: Item = {};
    for (const k of keySchema) key[k.name] = item[k.name];
    const desc = keySchema.map((k) => `${k.name}=${String(item[k.name])}`).join(", ");
    if (!window.confirm(`Delete the item ${desc}? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/environments/${environmentId}/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", table: active, key }),
    });
    setBusy(false);
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Delete failed.");
      return;
    }
    setNote(d.note ?? "Item deleted.");
    loadTable();
  }

  function editItem(item: Item) {
    setEditorJson(JSON.stringify(item, null, 2));
    setEditorOpen(true);
    setEditorError(null);
  }

  function newItem() {
    const skeleton: Item = {};
    for (const k of keySchema) skeleton[k.name] = "";
    setEditorJson(JSON.stringify(skeleton, null, 2));
    setEditorOpen(true);
    setEditorError(null);
  }

  const columns = deriveColumns(items ?? [], keySchema);

  return (
    <Card
      title="Data Studio"
      action={
        <Button variant="ink" className="px-3.5 py-1.5 text-xs" onClick={newItem} disabled={!active || busy}>
          + New item
        </Button>
      }
    >
      <div className="space-y-4">
        {simulated && (
          <Alert tone="info">
            Simulation mode, this is generated sample data; writes are validated and
            acknowledged but not persisted.
          </Alert>
        )}
        {note && <Alert tone="success">{note}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        {/* table pills */}
        <div className="flex flex-wrap gap-1.5">
          {(tables ?? []).map((t) => (
            <button
              key={t.name}
              onClick={() => setActive(t.name)}
              className={`rounded-[3px] px-3 py-1 font-mono text-[11px] uppercase tracking-wide ${
                active === t.name ? "bg-ink text-paper" : "border border-line text-ink-faint hover:text-ink"
              }`}
              title={t.name}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* query box */}
        <div className="flex flex-wrap items-start gap-2">
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={2}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-[4px] border border-line bg-white px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-cargo"
            placeholder={`SELECT * FROM "table" WHERE field = 'value'`}
          />
          <div className="flex gap-2">
            <Button variant="ink" className="px-3.5 py-2 text-xs" onClick={runQuery} disabled={busy}>
              Run query
            </Button>
            {queryMode && (
              <Button variant="ghost" className="px-3.5 py-2 text-xs" onClick={loadTable} disabled={busy}>
                Back to scan
              </Button>
            )}
          </div>
        </div>
        <p className="-mt-2 text-[12px] text-ink-faint">
          Free-form queries are read-only (PartiQL SELECT). Edits and deletes go through the
          item editor with confirmation.
        </p>

        {/* items */}
        {items === null ? (
          <p className="py-6 text-center font-mono text-sm text-ink-faint">loading items…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            {queryMode ? "No items match that query." : "This table is empty."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[6px] border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-paper font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">
                      {c}
                      {keySchema.some((k) => k.name === c) && <span className="text-cargo"> ⚿</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item, i) => (
                  <tr key={i} className="align-top hover:bg-paper">
                    {columns.map((c) => (
                      <td key={c} className="max-w-[240px] truncate px-3 py-2 font-mono text-[12.5px] text-ink-soft">
                        {renderCell(item[c])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button className="font-mono text-[11px] uppercase text-ink-faint hover:text-ink" onClick={() => editItem(item)}>
                        edit
                      </button>
                      <button className="ml-3 font-mono text-[11px] uppercase text-red-700 hover:underline" onClick={() => removeItem(item)}>
                        del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* editor */}
        {editorOpen && (
          <div className="rounded-[6px] border-2 border-cargo/40 bg-paper p-4">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Item editor, JSON · keys: {keySchema.map((k) => k.name).join(", ") || "…"}
            </p>
            {editorError && <Alert tone="error">{editorError}</Alert>}
            <Textarea
              rows={8}
              value={editorJson}
              onChange={(e) => setEditorJson(e.target.value)}
              spellCheck={false}
              className="font-mono text-[13px]"
            />
            <div className="mt-3 flex gap-2">
              <Button onClick={saveItem} disabled={busy}>
                {busy ? "Saving…" : "Save item"}
              </Button>
              <Button variant="ghost" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <p className="text-[12px] text-ink-faint">
          Item-level access is an opt-in permission: it requires the connector role deployed
          with <code className="font-mono">EnableDataStudio=true</code>. Without it, live mode
          returns a clear permission error and your data stays untouchable.
        </p>
      </div>
    </Card>
  );
}

function deriveColumns(items: Item[], keySchema: KeyPart[]): string[] {
  const keys = keySchema.map((k) => k.name);
  const rest = new Set<string>();
  for (const item of items.slice(0, 25)) {
    for (const k of Object.keys(item)) if (!keys.includes(k)) rest.add(k);
  }
  return [...keys, ...Array.from(rest).sort()].slice(0, 8);
}

function renderCell(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

"use client";
/** Component 3.3 — Custom Sample Tracker. Rejected rounds stay visible forever. */
import { useState } from "react";
import { Camera, FlaskConical, Plus } from "lucide-react";
import type { Colour } from "@/features/types";
import { act, useCurrentUser, useDb } from "@/features/lib/store";
import { addSampleRound, recordSampleOutcome } from "@/features/lib/store/actions/color-card";
import { date } from "@/features/lib/format";
import { userName } from "@/features/lib/store/helpers";
import { toast } from "@/features/lib/toast";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";

export function SamplePanel({ colour }: { colour: Colour }) {
  const db = useDb((d) => d);
  const user = useCurrentUser();
  const rounds = db.sampleRounds.filter((r) => r.colourId === colour.id).sort((a, b) => a.round - b.round);
  const [adding, setAdding] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<string>();
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), deliveredBy: user.id, note: "" });
  const [outcome, setOutcome] = useState<{ value: "accepted" | "rejected"; note: string }>({ value: "accepted", note: "" });
  const [photos, setPhotos] = useState(0);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
          <FlaskConical className="h-3.5 w-3.5" /> Custom sample rounds
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add sample round
        </Button>
      </div>
      {rounds.length === 0 ? (
        <EmptyState title="No samples recorded." body="Add the first sample round." className="bg-white" />
      ) : (
        <ol className="space-y-2">
          {rounds.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-xs">
              <span className="font-bold text-ink">Round {r.round}</span>
              <span className="text-gray-500">{date(r.date)}</span>
              <span className="text-gray-500">delivered by {userName(db, r.deliveredBy)}</span>
              {r.outcome ? (
                <Badge tone={r.outcome === "accepted" ? "green" : "red"}>{r.outcome === "accepted" ? "Accepted" : "Rejected"}</Badge>
              ) : (
                <Badge tone="amber">Awaiting customer</Badge>
              )}
              {r.note && <span className="w-full text-gray-500 italic sm:w-auto">“{r.note}”</span>}
              {!r.outcome && (
                <Button size="sm" variant="primary" className="ml-auto" onClick={() => setOutcomeFor(r.id)}>
                  Record outcome
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title={`Sample round for ${colour.name}`}
        description="Sample date and who delivered it are required."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const res = act(addSampleRound, colour.id, { date: new Date(form.date).toISOString(), deliveredBy: form.deliveredBy, note: form.note });
                if (res.ok) {
                  toast.success("Sample round recorded");
                  setAdding(false);
                }
              }}
            >
              Save round
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sample date" required htmlFor="sr-date">
            <Input id="sr-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Delivered by" required htmlFor="sr-by">
            <Select id="sr-by" value={form.deliveredBy} onChange={(e) => setForm({ ...form, deliveredBy: e.target.value })}>
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" className="sm:col-span-2" htmlFor="sr-note">
            <Textarea id="sr-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => setPhotos((p) => p + 1)}>
              <Camera className="h-3.5 w-3.5" /> Attach photo
            </Button>
            {photos > 0 && <span className="ml-2 text-xs text-gray-500">{photos} photo(s) attached (simulated)</span>}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!outcomeFor}
        onOpenChange={(v) => !v && setOutcomeFor(undefined)}
        title="Record customer outcome"
        description="Outcomes are permanent. A rejection keeps this round visible; add a new round for the next attempt."
        footer={
          <>
            <Button onClick={() => setOutcomeFor(undefined)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const res = act(recordSampleOutcome, outcomeFor!, outcome.value, outcome.note);
                if (res.ok) {
                  toast.success(outcome.value === "accepted" ? "Sample accepted — specifications can now be approved" : "Sample rejected — round kept on record");
                  setOutcomeFor(undefined);
                }
              }}
            >
              Save outcome
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["accepted", "rejected"] as const).map((v) => (
              <Button key={v} variant={outcome.value === v ? "dark" : "secondary"} onClick={() => setOutcome({ ...outcome, value: v })}>
                {v === "accepted" ? "Accepted" : "Rejected"}
              </Button>
            ))}
          </div>
          <Field label="Note (optional)" htmlFor="so-note">
            <Textarea id="so-note" value={outcome.note} onChange={(e) => setOutcome({ ...outcome, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

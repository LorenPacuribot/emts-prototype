"use client";
/**
 * Component 26.3 — Touch-up request form on the public page.
 * Prefills property, room, surface and colour. Collects name, phone or
 * email and a note. Simple challenge + per-link rate limit (3 per hour).
 * Never shows stored contact details, never approves a purchase, never
 * promises a colour match.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Phone } from "lucide-react";
import { act, useDb } from "@/features/lib/store";
import { submitTouchUp } from "@/features/lib/store/actions/qr";
import { now } from "@/features/lib/clock";
import { BUSINESS, challengeFor, touchUpRateLimited, validateTouchUp } from "@/features/lib/rules/property";
import { Banner, Button, Field, Input, Modal, Select, Textarea } from "@/features/components/ui";
import type { CustomerRecord } from "./customer-record";

export interface TouchUpPrefill {
  surfaceId?: string;
  colourLabel?: string;
}

export function TouchUpModal({ prefill, onClose, linkRef, record }: { prefill?: TouchUpPrefill; onClose: () => void; linkRef: string; record: CustomerRecord }) {
  const db = useDb((d) => d);
  const options = record.areas.flatMap((a) => a.surfaces.map((s) => ({ id: s.surface.id, label: `${a.area.name} — ${s.surface.name}`, colour: s.latest.colourName === "Unknown" ? "" : `${s.latest.colourName} ${s.latest.colourNumber}` })));
  const blank = { surfaceId: "", name: "", phone: "", email: "", note: "", challenge: "" };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const challenge = challengeFor(linkRef);
  const limited = touchUpRateLimited(db.touchUpRequests.filter((r) => r.linkRef === linkRef).map((r) => r.createdAt), now());

  useEffect(() => {
    if (prefill) {
      setF({ ...blank, surfaceId: prefill.surfaceId ?? "" });
      setErrors({});
      setDone(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const chosen = options.find((o) => o.id === f.surfaceId);
  const colourLabel = chosen?.colour ?? prefill?.colourLabel ?? "";

  const submit = () => {
    if (limited) return;
    const errs = validateTouchUp(f, challenge.answer);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = act(submitTouchUp, linkRef, { surfaceId: f.surfaceId || undefined, colourLabel: colourLabel || undefined, requesterName: f.name, phone: f.phone, email: f.email, note: f.note });
    if (res.ok) setDone(true);
  };

  return (
    <Modal
      open={!!prefill}
      onOpenChange={(v) => !v && onClose()}
      title="Request touch-up paint"
      description={`${record.address}, ${record.cityLine}`}
      footer={done || limited ? <Button variant="primary" onClick={onClose}>Close</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Send request</Button></>}
    >
      {done ? (
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <p className="font-display text-lg font-bold text-ink">Thanks — we have your request and the office will be in touch.</p>
          <p className="text-sm text-gray-600">We&apos;ve sent you an automatic acknowledgment. This is a request only: nothing has been ordered or charged, and the office will confirm what is available.</p>
        </div>
      ) : limited ? (
        <Banner tone="warn" title="Request limit reached">
          You have already sent a request recently. Please call us on <a className="font-bold underline" href={`tel:${BUSINESS.phone.replace(/\D/g, "")}`}>{BUSINESS.phone}</a>.
        </Banner>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Room and surface" htmlFor="tu-surface">
            <Select id="tu-surface" value={f.surfaceId} onChange={(e) => setF({ ...f, surfaceId: e.target.value })}>
              <option value="">Not sure / general</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Colour" htmlFor="tu-colour" hint="From your record. We can't promise an exact match to aged paint.">
            <Input id="tu-colour" value={colourLabel || "—"} readOnly className="bg-gray-50" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name" required htmlFor="tu-name" error={errors.name}>
              <Input id="tu-name" autoComplete="name" value={f.name} invalid={!!errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="tu-phone" error={errors.contact}>
              <Input id="tu-phone" type="tel" autoComplete="tel" value={f.phone} invalid={!!errors.contact} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Email" htmlFor="tu-email" error={errors.email} hint="Phone or email — one is enough.">
            <Input id="tu-email" type="email" autoComplete="email" value={f.email} invalid={!!errors.email || !!errors.contact} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Note" htmlFor="tu-note">
            <Textarea id="tu-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What needs touching up?" />
          </Field>
          <Field label={`Quick check: ${challenge.question}`} required htmlFor="tu-challenge" error={errors.challenge}>
            <Input id="tu-challenge" inputMode="numeric" value={f.challenge} invalid={!!errors.challenge} onChange={(e) => setF({ ...f, challenge: e.target.value })} className="w-28" />
          </Field>
          <p className="flex items-center gap-1.5 text-xs text-gray-500"><Phone className="h-3.5 w-3.5" /> Prefer to talk? Call {BUSINESS.phone}.</p>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Modal>
  );
}

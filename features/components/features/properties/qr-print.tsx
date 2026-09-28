"use client";
/**
 * Printed formats (feature 26 Output/Print-out):
 * - Business card: 3.5 × 2 in, QR code at least 0.8 in square (we print 1.1 in).
 * - Sticker: 2 × 2 in, QR code at least 1.2 in square (we print 1.3 in).
 * Both carry the business logo and a readable phone number.
 */
import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Ruler } from "lucide-react";
import type { Property, QrLink } from "@/features/types";
import { act } from "@/features/lib/store";
import { recordPrint } from "@/features/lib/store/actions/qr";
import { printElement } from "@/features/lib/export";
import { BUSINESS } from "@/features/lib/rules/property";
import { absoluteUrl } from "@/features/lib/navigation";
import { toast } from "@/features/lib/toast";
import { Logo } from "@/features/components/layout/icon-rail";
import { Button, Modal } from "@/features/components/ui";

export function recordUrl(ref: string) {
  return absoluteUrl(`/paint-record/view/?token=${encodeURIComponent(ref)}`);
}

export function BusinessCard({ link, property }: { link: QrLink; property: Property }) {
  return (
    <div className="flex h-[2in] w-[3.5in] shrink-0 items-center gap-[0.14in] overflow-hidden rounded-[0.08in] border border-slate-300 bg-white p-[0.14in] text-ink">
      <div className="flex h-[1.1in] w-[1.1in] shrink-0 items-center justify-center">
        <QRCodeSVG value={recordUrl(link.ref)} size={106} level="M" className="h-[1.1in] w-[1.1in]" title="Scan for your paint record" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Logo className="h-6 w-6" />
          <span className="font-display text-[10pt] font-extrabold leading-tight">{BUSINESS.name}</span>
        </div>
        <div className="mt-1.5 text-[8pt] font-semibold leading-tight text-slate-600">Scan for your home&apos;s paint record</div>
        <div className="mt-0.5 text-[7pt] leading-tight text-slate-500">{property.address}</div>
        <div className="mt-1.5 font-display text-[12pt] font-extrabold leading-none">{BUSINESS.phone}</div>
      </div>
    </div>
  );
}

export function Sticker({ link }: { link: QrLink }) {
  return (
    <div className="flex h-[2in] w-[2in] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[0.1in] border border-slate-300 bg-white p-[0.1in] text-ink">
      <QRCodeSVG value={recordUrl(link.ref)} size={125} level="M" className="h-[1.3in] w-[1.3in]" title="Scan for your paint record" />
      <div className="mt-[0.05in] flex items-center gap-1">
        <Logo className="h-3.5 w-3.5" />
        <span className="text-[6.5pt] font-bold">Paint record</span>
      </div>
      <div className="font-display text-[10pt] font-extrabold leading-tight">{BUSINESS.phone}</div>
    </div>
  );
}

export function PrintQrModal({ format, link, property, onClose }: { format?: "BusinessCard" | "Sticker"; link?: QrLink; property: Property; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!format || !link) return null;
  const card = format === "BusinessCard";
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={card ? "Print business card" : "Print sticker"}
      description={card ? "3.5 × 2 in. QR code 1.1 in square (minimum 0.8 in)." : "2 × 2 in. QR code 1.3 in square (minimum 1.2 in)."}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!act(recordPrint, link.id, format).ok) return;
              printElement(ref.current, `${property.id} ${card ? "card" : "sticker"}`);
              toast.success(card ? "Business card sent to print" : "Sticker sent to print", "Print at 100% scale so the sizes stay exact.");
            }}
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
        </>
      }
    >
      <div className="flex justify-center overflow-x-auto rounded-xl bg-slate-100 p-6">
        <div ref={ref}>{card ? <BusinessCard link={link} property={property} /> : <Sticker link={link} />}</div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-500">
        <Ruler className="h-3.5 w-3.5" /> Shown at true size on a standard screen. Tested scan targets: iPhone 11 and a recent Samsung A-series in normal indoor light.
      </p>
    </Modal>
  );
}

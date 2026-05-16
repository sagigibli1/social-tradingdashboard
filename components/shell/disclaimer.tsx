"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";

import { copy } from "@/lib/copy";

const ACK_KEY = "tradingdashboard.disclaimer_ack";

export function DisclaimerStrip() {
  const [open, setOpen] = useState(false);
  const [firstLoadShown, setFirstLoadShown] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ack = window.localStorage.getItem(ACK_KEY);
    if (!ack) {
      setOpen(true);
      setFirstLoadShown(true);
    }
  }, []);

  const ack = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACK_KEY, "1");
    }
    setOpen(false);
  };

  return (
    <>
      <div className="h-7 border-b-2 border-[#F59E0B] bg-[#1E222D] flex items-center justify-between px-3 text-[11px] text-[#D1D4DC]">
        <span>{copy.disclaimerStrip}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[#F59E0B] underline-offset-2 hover:underline cursor-pointer"
          aria-label={copy.disclaimerLink}
        >
          ({copy.disclaimerLink})
        </button>
      </div>
      {open && (
        <DisclaimerModal
          onAck={ack}
          onClose={() => (firstLoadShown ? ack() : setOpen(false))}
        />
      )}
    </>
  );
}

function DisclaimerModal({
  onAck,
  onClose,
}: {
  onAck: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={copy.disclaimerModalTitle}
    >
      <div className="bg-[#1E222D] border border-[#2A2E39] rounded-sm max-w-lg w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2E39]">
          <h2 className="text-[14px] font-semibold text-[#D1D4DC]">
            {copy.disclaimerModalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeButton}
            className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 text-[13px] leading-6 text-[#D1D4DC]">
          {copy.disclaimerModalBody}
        </div>
        <div className="px-4 py-3 border-t border-[#2A2E39] flex items-center justify-between gap-3">
          <Link
            href="/terms"
            className="text-[12px] text-[#2962FF] hover:underline cursor-pointer"
          >
            {copy.navTerms}
          </Link>
          <button
            type="button"
            onClick={onAck}
            className="inline-flex items-center h-7 px-3 bg-[#F59E0B] hover:bg-[#D97706] text-[#131722] text-[12px] font-semibold rounded-sm cursor-pointer"
          >
            {copy.disclaimerModalAck}
          </button>
        </div>
      </div>
    </div>
  );
}

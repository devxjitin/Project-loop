"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const confirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={title}
    >
      <p className="text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button
          className="bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          className="bg-rose-600 hover:bg-rose-700"
          onClick={() => void confirm()}
          disabled={submitting}
        >
          {submitting ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

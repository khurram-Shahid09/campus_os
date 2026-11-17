"use client";

import { ActionForm, Submit } from "@/components/form";
import { decideDiscountAction } from "./actions";

export function DiscountDecision({ id }: { id: string }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={decideDiscountAction}>
        <input type="hidden" name="adjustmentId" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <Submit variant="ghost" testId="reject-discount">Reject</Submit>
      </ActionForm>
      <ActionForm action={decideDiscountAction}>
        <input type="hidden" name="adjustmentId" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <Submit testId="approve-discount">Approve</Submit>
      </ActionForm>
    </div>
  );
}

import { Suspense } from "react";
import { DeploymentsIndex } from "@/components/deployments-index";

export default function DeploymentsPage() {
  return (
    <Suspense>
      <DeploymentsIndex />
    </Suspense>
  );
}

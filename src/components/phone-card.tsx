"use client";

import { Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getPhoneAccess, togglePhoneAccess } from "@/actions";
import type { PhoneAccess } from "@/lib/types";
import { useStatus } from "./status-provider";
import { Button, Card, CardTitle, Confirm, Spinner } from "./ui";

export function PhoneCard() {
  const { notify } = useStatus();
  const [access, setAccess] = useState<PhoneAccess | null>(null);
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => setAccess(await getPhoneAccess()), []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const apply = async (enable: boolean) => {
    setConfirming(null);
    setRestarting(true);
    const result = await togglePhoneAccess(enable);
    if (!result.ok) {
      setRestarting(false);
      return notify("error", result.error);
    }
    // The service restarts underneath us; come back once it answers again.
    setTimeout(() => window.location.reload(), 6000);
  };

  return (
    <Card>
      <CardTitle icon={<Smartphone className="size-4" />}>On your phone</CardTitle>
      {access === null ? (
        <Spinner label="Loading…" />
      ) : restarting ? (
        <Spinner label="Restarting DevLaunch… this page reloads in a few seconds." />
      ) : access.open ? (
        <>
          <p className="text-[12px] text-ink-dim">Open one of these on a phone connected to the same network, sign in, then use “Add to Home Screen” (Share menu on iPhone, browser menu on Android) to get an app icon.</p>
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {access.qrSvg && <div className="shrink-0 rounded-lg border border-line bg-bg p-2 [&>svg]:block [&>svg]:size-[150px]" dangerouslySetInnerHTML={{ __html: access.qrSvg }} />}
            <ul className="min-w-0 space-y-1.5 font-mono text-[12px]">
              {access.urls.map((url) => (
                <li key={url} className="break-all text-ink">
                  {url}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[11px] text-ink-faint">Anyone on this network can reach the sign-in page; your account password protects the rest. Outside this network you would need a VPN into it (Tailscale is the simple option).</p>
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Back to this Mac only
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] text-ink-dim">DevLaunch currently answers on this Mac only. Allow other devices on your network and it becomes an app on your phone: same screens, deploys, terminals and VPN button.</p>
          <div className="mt-3">
            <Button size="sm" variant="primary" onClick={() => setConfirming(true)}>
              Allow phone access
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Restarts DevLaunch for a few seconds. Sets DEVLAUNCH_BIND=0.0.0.0 in .env.</p>
        </>
      )}
      {confirming !== null && (
        <div className="mt-3">
          <Confirm
            title={confirming ? "Allow other devices on this network?" : "Go back to this Mac only?"}
            body={confirming ? "The sign-in page becomes reachable from any device on the same network. DevLaunch restarts, then this page reloads." : "Phones will no longer reach DevLaunch. It restarts, then this page reloads."}
            confirmLabel={confirming ? "Allow and restart" : "Restrict and restart"}
            tone="primary"
            onCancel={() => setConfirming(null)}
            onConfirm={() => void apply(confirming)}
          />
        </div>
      )}
    </Card>
  );
}

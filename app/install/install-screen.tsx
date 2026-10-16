"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Ellipsis, PlusSquare, Share, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isStandalone, platformName } from "@/components/pwa/pwa-runtime"
import { dismissInstall, installDismissals, installPromptReady, markInstallSeen, onInstallPromptChange, promptInstall } from "@/lib/install-prompt"

type Push = "idle" | "working" | "on" | "blocked" | "unsupported" | "error"

interface Device {
  standalone: boolean
  platform: string
  /** Only Safari can add to the Home Screen on iPhone. */
  safari: boolean
  dismissals: number
  push: Push
}

// Read once per page load; these do not change while the screen is open.
let device: Device | null = null
function readDevice(): Device {
  if (device) return device
  const ua = navigator.userAgent
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
  device = {
    standalone: isStandalone(),
    platform: platformName(),
    safari: /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA/.test(ua),
    dismissals: installDismissals(),
    push: !supported ? "unsupported" : Notification.permission === "denied" ? "blocked" : "idle",
  }
  return device
}
const noSubscribe = () => () => {}

/**
 * Add to Home Screen with platform-specific steps, then reminders (PRD F1).
 * "Not now" the first time, "Skip" the second (Q62); after that it never blocks.
 */
export function InstallScreen({ productName, vapidPublicKey }: { productName: string; vapidPublicKey: string }) {
  const router = useRouter()
  const found = useSyncExternalStore(noSubscribe, readDevice, () => null)
  const canPrompt = useSyncExternalStore(onInstallPromptChange, installPromptReady, () => false)
  const [installedNow, setInstalledNow] = useState(false)
  const [pushNow, setPush] = useState<Push | null>(null)

  useEffect(() => markInstallSeen(), [])

  if (!found) return null
  const env = { ...found, standalone: found.standalone || installedNow }
  const push = pushNow ?? found.push
  const iosNotInstalled = env.platform === "ios" && !env.standalone

  async function turnOnReminders() {
    setPush("working")
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") return setPush(permission === "denied" ? "blocked" : "idle")
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey }))
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) })
      setPush(res.ok ? "on" : "error")
    } catch {
      setPush("error")
    }
  }

  function leave(dismissed: boolean) {
    if (dismissed) dismissInstall()
    router.replace("/today")
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section aria-labelledby="install-title" className="flex flex-col gap-4">
        <h1 id="install-title" className="text-title">
          {env.standalone ? `${productName} is on your Home Screen` : `Put ${productName} on your Home Screen`}
        </h1>
        {!env.standalone && env.platform === "ios" && env.safari && (
          <ol aria-label="Steps" className="flex flex-col gap-3">
            <Step icon={<Share aria-hidden className="size-6" strokeWidth={1.75} />} text="Tap Share in the Safari toolbar." />
            <Step icon={<PlusSquare aria-hidden className="size-6" strokeWidth={1.75} />} text="Choose Add to Home Screen, then Add." />
            <Step icon={<Smartphone aria-hidden className="size-6" strokeWidth={1.75} />} text={`Open ${productName} from your Home Screen and sign in with your code.`} />
          </ol>
        )}
        {!env.standalone && env.platform === "ios" && !env.safari && <p className="text-body">Open this page in Safari to add it to your Home Screen.</p>}
        {!env.standalone && env.platform !== "ios" && canPrompt && (
          <Button onClick={async () => setInstalledNow(await promptInstall())}>Install {productName}</Button>
        )}
        {!env.standalone && env.platform !== "ios" && !canPrompt && (
          <ol aria-label="Steps" className="flex flex-col gap-3">
            <Step icon={<Ellipsis aria-hidden className="size-6" strokeWidth={1.75} />} text="Open your browser menu." />
            <Step icon={<PlusSquare aria-hidden className="size-6" strokeWidth={1.75} />} text="Choose Install app or Add to Home screen." />
          </ol>
        )}
      </section>

      <section aria-labelledby="reminders-title" className="flex flex-col gap-3 rounded-lg bg-surface p-4">
        <h2 id="reminders-title" className="text-headline">
          Reminders
        </h2>
        <p className="text-body text-text-muted">A nudge in the evening on days with nothing logged, your check-in reminder, and replies from your coach.</p>
        {iosNotInstalled ? (
          <p className="text-body">On iPhone, reminders only work once {productName} is on your Home Screen.</p>
        ) : push === "on" ? (
          <p role="status" className="text-body">
            Reminders are on.
          </p>
        ) : push === "blocked" ? (
          <p role="status" className="text-body">
            Reminders are blocked. Turn on notifications for {productName} in your phone settings.
          </p>
        ) : push === "unsupported" ? (
          <p className="text-body">This browser cannot show reminders.</p>
        ) : (
          <>
            <Button variant="secondary" onClick={turnOnReminders} disabled={push === "working" || !vapidPublicKey}>
              {push === "working" ? "Turning on" : "Turn on reminders"}
            </Button>
            {push === "error" && (
              <p role="alert" className="text-body">
                Reminders did not turn on. Try again.
              </p>
            )}
          </>
        )}
      </section>

      <div className="mt-auto flex flex-col gap-2">
        {env.standalone || push === "on" ? (
          <Button onClick={() => leave(false)}>Continue</Button>
        ) : (
          <Button variant="text" onClick={() => leave(true)}>
            {env.dismissals >= 1 ? "Skip" : "Not now"}
          </Button>
        )}
      </div>
    </div>
  )
}

function Step({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex min-h-11 items-center gap-3 rounded-lg bg-surface px-4 py-3">
      {icon}
      <span className="text-body">{text}</span>
    </li>
  )
}

"use client"

import { useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Ellipsis, PlusSquare, Share, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isStandalone, platformName } from "@/components/pwa/pwa-runtime"
import { dismissInstall, installPromptReady, onInstallPromptChange, promptInstall } from "@/lib/install-prompt"

type Push = "idle" | "working" | "on" | "blocked" | "unsupported" | "error"

interface Device {
  standalone: boolean
  platform: string
  /** Only Safari can add to the Home Screen on iPhone. */
  safari: boolean
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
    push: !supported ? "unsupported" : Notification.permission === "denied" ? "blocked" : "idle",
  }
  return device
}
const noSubscribe = () => () => {}

/**
 * Add to Home Screen with platform-specific steps, then reminders (PRD F1).
 * "Not now" once (Q62); later prompts are a single banner on Today, and Me links here.
 */
const SUBSCRIBE_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function InstallScreen({
  productName,
  vapidPublicKey,
  from,
}: {
  productName: string
  vapidPublicKey: string
  /** Opened from More or the Today banner: leaving goes back there and is not a dismissal. */
  from: "more" | "today" | null
}) {
  const router = useRouter()
  const found = useSyncExternalStore(noSubscribe, readDevice, () => null)
  const canPrompt = useSyncExternalStore(onInstallPromptChange, installPromptReady, () => false)
  const [installedNow, setInstalledNow] = useState(false)
  const [pushNow, setPush] = useState<Push | null>(null)

  if (!found) return null
  const env = { ...found, standalone: found.standalone || installedNow }
  const push = pushNow ?? found.push
  const iosNotInstalled = env.platform === "ios" && !env.standalone

  async function turnOnReminders() {
    setPush("working")
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") return setPush(permission === "denied" ? "blocked" : "idle")
      // A service worker or push service that never answers must not leave
      // the button stuck on "Turning on".
      const saved = await withTimeout(subscribe(), SUBSCRIBE_TIMEOUT_MS)
      setPush(saved ? "on" : "error")
    } catch {
      setPush("error")
    }
  }

  async function subscribe(): Promise<boolean> {
    const registration = await navigator.serviceWorker.ready
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey }))
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) })
    return res.ok
  }

  function leave(dismissed: boolean) {
    if (dismissed && !from) dismissInstall()
    router.replace(from === "more" ? "/more" : "/today")
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
                Reminders could not be turned on. Try again.
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
            {from ? "Back" : "Not now"}
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

import { useMemo } from "react"
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react"
import { AppProvider as PolarisProvider, Page, Banner } from "@shopify/polaris"
import enTranslations from "@shopify/polaris/locales/en.json"
import "@shopify/polaris/build/esm/styles.css"
import { Dashboard } from "./Dashboard"

/**
 * App root for the embedded experience.
 *
 * Wraps the dashboard in:
 *  - PolarisProvider for Shopify-native UI components
 *  - AppBridgeProvider for embedding + session-token auth
 *
 * The `host` and `apiKey` come from the URL/window injected by Shopify when
 * the app is loaded inside admin.
 */

function getHostParam(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get("host")
}

const SHOPIFY_API_KEY = import.meta.env.VITE_SHOPIFY_API_KEY as string | undefined

export function App() {
  const host = useMemo(getHostParam, [])

  const appBridgeConfig = useMemo(
    () =>
      host && SHOPIFY_API_KEY
        ? { apiKey: SHOPIFY_API_KEY, host, forceRedirect: true }
        : null,
    [host],
  )

  // If we're not embedded (no host) we can't authenticate. Guide the user.
  if (!appBridgeConfig) {
    return (
      <PolarisProvider i18n={enTranslations}>
        <Page title="Decision Replay Engine">
          <Banner tone="warning" title="Open this app from your Shopify admin">
            <p>
              This embedded app must be launched from inside your Shopify admin
              so it can authenticate. Please open it from the Apps section.
            </p>
          </Banner>
        </Page>
      </PolarisProvider>
    )
  }

  return (
    <PolarisProvider i18n={enTranslations}>
      <AppBridgeProvider config={appBridgeConfig}>
        <Dashboard />
      </AppBridgeProvider>
    </PolarisProvider>
  )
}

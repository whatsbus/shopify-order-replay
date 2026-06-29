import { useMemo } from "react"
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react"
import { AppProvider as PolarisProvider, Page, Banner } from "@shopify/polaris"
import enTranslations from "@shopify/polaris/locales/en.json"
import "@shopify/polaris/build/esm/styles.css"
import { Dashboard } from "./Dashboard"

function getHost(): string | null {
  return new URLSearchParams(window.location.search).get("host")
}

const API_KEY = import.meta.env.VITE_SHOPIFY_API_KEY as string | undefined

export function App() {
  const host = useMemo(getHost, [])

  const appBridgeConfig = useMemo(() => {
    if (!host || !API_KEY) return null

    return {
      apiKey: API_KEY,
      host,
      forceRedirect: true,
    }
  }, [host])

  if (!appBridgeConfig) {
    return (
      <PolarisProvider i18n={enTranslations}>
        <Page title="Decision Replay Engine">
          <Banner tone="warning" title="Open from Shopify Admin">
            This app must be launched inside Shopify Admin to authenticate.
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

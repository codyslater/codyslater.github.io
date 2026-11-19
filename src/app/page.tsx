import { SplashHome } from "@/components/splash/SplashHome";

// The landing: the splash (board melting into a living graph behind the name), then the nav screen.
// SplashHome reads `?skip=1` and the session flag in the browser, so the served HTML is the splash itself.
export default function Home() {
  return <SplashHome />;
}

// Sets the reading theme on <html> before a post or project page paints: the reader's saved
// choice, else their device's light/dark setting. Rendered only on single-post and
// single-project pages; the attribute is inert elsewhere because every light rule is scoped
// to .writing-literary.reading.
const code = `(function(){var t;try{t=localStorage.getItem("writing-theme")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.writingTheme=t})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

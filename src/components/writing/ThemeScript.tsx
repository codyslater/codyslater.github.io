// Sets the reading theme on <html> before anything paints: the reader's saved choice, else
// their device's light/dark setting. Rendered once, in the root layout, so it runs on a hard
// load of ANY page. That matters for a click-through: a reader who lands on the projects list
// and clicks into a project never reloads, so the theme must already be on <html> or the
// project page draws one dark frame before it turns light. The attribute is inert on every
// other page because every light rule is scoped to .writing-literary.reading.
const code = `(function(){var t;try{t=localStorage.getItem("writing-theme")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.writingTheme=t})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

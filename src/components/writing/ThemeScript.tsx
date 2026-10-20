// Sets the saved reading theme on <html> before a post or project page paints.
// Rendered only on single-post and single-project pages; the attribute is inert
// elsewhere because every light rule is scoped to .writing-literary.reading.
const code = `try{var t=localStorage.getItem("writing-theme");if(t==="light"||t==="dark")document.documentElement.dataset.writingTheme=t}catch(e){}`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

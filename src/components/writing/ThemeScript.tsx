// Sets the saved writing theme on <html> before the writing page paints.
// Rendered only inside writing routes; the attribute is inert elsewhere
// because every theme rule is scoped to .writing-literary.
const code = `try{var t=localStorage.getItem("writing-theme");if(t==="light"||t==="dark")document.documentElement.dataset.writingTheme=t}catch(e){}`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

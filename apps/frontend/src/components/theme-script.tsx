export function ThemeScript() {
  const code = `
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    var el = document.documentElement;
    if (dark) { el.classList.add('dark'); } else { el.classList.remove('dark'); }
  } catch (e) {}
  `
  return <script dangerouslySetInnerHTML={{ __html: code }} />
}

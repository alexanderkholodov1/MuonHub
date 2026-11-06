/** Where the visitor's theme choice is kept (ThemeProvider). */
export const THEME_STORAGE_KEY = "muonhub-theme";

/**
 * Applies the theme before the first paint, with ThemeProvider's rule: the stored choice, else the
 * system preference, else dark. Rendered as an inline script in the document head, so a visitor
 * on the light theme never sees the dark theme flash first. (Kept outside the "use client"
 * module so a server layout receives the string itself.)
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(s==="light"||s==="dark")t=s}catch(e){}if(!t)t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.setAttribute("data-theme",t)})();`;

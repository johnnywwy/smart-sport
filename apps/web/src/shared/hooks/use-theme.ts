import { useEffect } from "react";
import { usePreferences } from "../stores/preferences";

export function useTheme() {
  const dark = usePreferences((state) => state.dark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
}

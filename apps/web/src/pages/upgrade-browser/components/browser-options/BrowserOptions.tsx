import type { ComponentProps } from "react";
import { BrowserOption } from "../browser-option/BrowserOption";

type BrowserOptionsProps = {
  browsers: readonly ComponentProps<typeof BrowserOption>[];
};

export function BrowserOptions({ browsers }: BrowserOptionsProps) {
  return (
    <section aria-label="支持的浏览器" className="grid gap-4 sm:grid-cols-2">
      {browsers.map((browser) => (
        <BrowserOption key={browser.name} {...browser} />
      ))}
    </section>
  );
}

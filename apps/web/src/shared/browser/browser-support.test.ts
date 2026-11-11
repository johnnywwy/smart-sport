import { describe, expect, it } from "vitest";
import { browserMinimumVersions, isSupportedBrowser } from "./browser-support";

const chrome = (version: number) =>
  `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
const safari = (version: string) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`;

describe("文档规定的浏览器版本基线", () => {
  it.each([
    [chrome(110), false],
    [chrome(111), true],
    [chrome(142), true],
    [`${chrome(142)} Edg/110.0.0.0`, false],
    [`${chrome(111)} Edg/111.0.0.0`, true],
    ["Mozilla/5.0 Gecko/20100101 Firefox/127.0", false],
    ["Mozilla/5.0 Gecko/20100101 Firefox/128.0", true],
    [safari("16.3"), false],
    [safari("16.4"), true],
    [safari("16.10"), true],
    [safari("17.0"), true],
    [safari("15.6"), false],
    [
      "Mozilla/5.0 (iPad; CPU OS 16_3 like Mac OS X) AppleWebKit/605.1.15 Version/16.3 Mobile/15E148 Safari/604.1",
      false,
    ],
    ["Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)", false],
    ["Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko", false],
    [`${chrome(142)} Edge/18.0`, false],
    [`${chrome(142)} OPR/100.0`, false],
    [
      "Mozilla/5.0 AppleWebKit/605.1.15 CriOS/142.0.0 Mobile/15 Safari/604.1",
      false,
    ],
    [
      "Mozilla/5.0 AppleWebKit/605.1.15 FxiOS/128.0 Mobile/15 Safari/604.1",
      false,
    ],
    ["Mozilla/5.0 AppleWebKit/605.1.15 Safari/605.1.15", false],
    ["UnknownBrowser/999.0", false],
    ["", false],
  ])("%s → %s", (userAgent, expected) => {
    expect(isSupportedBrowser(userAgent, browserMinimumVersions)).toBe(
      expected,
    );
  });
});

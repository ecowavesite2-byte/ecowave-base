import { describe, expect, it } from "vitest";
import { sanitizeHtmlFragment } from "../sanitize";

describe("sanitizeHtmlFragment", () => {
  it("removes <script> tags together with their content", () => {
    const out = sanitizeHtmlFragment("<script>alert(1)</script>");
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/alert/);
  });

  it("strips inline event handlers but keeps safe attributes", () => {
    const out = sanitizeHtmlFragment('<img src="/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toMatch(/src="\/a\.png"/);
  });

  it("removes javascript: hrefs", () => {
    const out = sanitizeHtmlFragment('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toMatch(/<a>x<\/a>/);
  });

  it("drops position:fixed while keeping safe declarations", () => {
    const out = sanitizeHtmlFragment('<p style="position:fixed;color:#fff">z</p>');
    expect(out).not.toMatch(/position\s*:\s*fixed/i);
    expect(out).toMatch(/color:\s*#fff/);
  });

  it("preserves safe declarations and allowed classes", () => {
    const out = sanitizeHtmlFragment(
      '<span style="font-size: 22px; line-height: 1.5; text-align: center;" class="font1">A</span>',
    );
    expect(out).toMatch(/font-size:\s*22px/);
    expect(out).toMatch(/line-height:\s*1\.5/);
    expect(out).toMatch(/text-align:\s*center/);
    expect(out).toMatch(/class="font1"/);
  });

  it("keeps only allowlisted classes", () => {
    const out = sanitizeHtmlFragment('<span class="danger font2">y</span>');
    expect(out).toMatch(/class="font2"/);
    expect(out).not.toMatch(/danger/);
  });

  it("keeps crawled board presentation tokens and drops unknown classes", () => {
    const out = sanitizeHtmlFragment('<div class="margin-top-xxl foo">x</div>');
    expect(out).toMatch(/class="margin-top-xxl"/);
    expect(out).not.toMatch(/foo/);
  });

  it("round-trips a crawled products post body with its key classes", () => {
    const html =
      '<div class="margin-top-xxl _comment_body_m202509172a498835198ce">' +
      '<p><img src="/images/upload/S20250811e0bd2f7c414df/cf2d7c2a3bacb.jpg" ' +
      'class="fr-fil fr-dib fr-draggable _img_light_gallery cursor_pointer" ' +
      'alt="cf2d7c2a3bacb.jpg"></p></div><div class="file_area"></div>';
    const out = sanitizeHtmlFragment(html);

    // authored presentation hooks survive…
    expect(out).toContain('class="margin-top-xxl"');
    expect(out).toContain("fr-fil fr-dib fr-draggable _img_light_gallery cursor_pointer");
    expect(out).toContain('class="file_area"');
    // …while the per-post dynamic id and unsafe artifacts are gone.
    expect(out).not.toMatch(/_comment_body/);
    expect(out).not.toMatch(/on\w+=/i);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("preserves the fr-dii block image class in a crawled body", () => {
    const out = sanitizeHtmlFragment(
      '<p style="text-align:left;"><img class="fr-dii _img_light_gallery cursor_pointer" ' +
        'src="/images/upload/S20250811e0bd2f7c414df/894ed113bf09b.jpg" alt="894ed113bf09b.jpg"></p>',
    );
    expect(out).toContain("fr-dii _img_light_gallery cursor_pointer");
    expect(out).toMatch(/class="fr-dii/);
  });

  it("cleans script and event-handler artifacts from a crawled board body", () => {
    const out = sanitizeHtmlFragment(
      '<div class="margin-top-xxl" onclick="alert(1)"><script>alert(2)</script>' +
        '<img class="fr-dii" src="/a.png" onerror="alert(3)"></div>',
    );
    expect(out).not.toMatch(/onclick|onerror/i);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/alert/);
    expect(out).toMatch(/class="margin-top-xxl"/);
    expect(out).toMatch(/class="fr-dii"/);
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtmlFragment("")).toBe("");
  });

  it("preserves structural inline styles and id attributes", () => {
    const out = sanitizeHtmlFragment(
      '<div id="box" style="margin:10px; padding:20px; width:100%; height:50px; min-height:1px; background:red;">x</div>',
    );
    expect(out).toMatch(/id="box"/);
    for (const declaration of [
      "margin:10px",
      "padding:20px",
      "width:100%",
      "height:50px",
      "min-height:1px",
      "background:red",
    ]) {
      expect(out).toContain(declaration);
    }
  });

  it("preserves the crawled padding-widget html (id + style + data-height)", () => {
    const html =
      '<div class="widget padding" data-height="109" style="margin-top:px; margin-bottom:px;">' +
      '<div id="padding_w2025082824e088cac0931" style="width:100%; min-height:1px; height:109px; "></div></div>';
    const out = sanitizeHtmlFragment(html);

    expect(out).toContain('id="padding_w2025082824e088cac0931"');
    expect(out).toContain('class="widget padding"');
    expect(out).toContain('data-height="109"');
    // invalid-but-harmless crawled declarations survive verbatim
    expect(out).toContain("margin-top:px");
    expect(out).toContain("margin-bottom:px");
    expect(out).toContain("width:100%");
    expect(out).toContain("min-height:1px");
    expect(out).toContain("height:109px");
  });

  it("removes only the dangerous declaration and keeps its siblings", () => {
    const fromUrl = sanitizeHtmlFragment(
      '<span style="font-size:22px; background:url(http://evil/x.png); color:#fff">x</span>',
    );
    expect(fromUrl).not.toMatch(/url\s*\(/i);
    expect(fromUrl).toMatch(/font-size:\s*22px/);
    expect(fromUrl).toMatch(/color:\s*#fff/);

    const fromExpression = sanitizeHtmlFragment(
      '<span style="color: expression(alert(1)); text-align:center">x</span>',
    );
    expect(fromExpression).not.toMatch(/expression/i);
    expect(fromExpression).toMatch(/text-align:\s*center/);
  });

  it("removes a url(data:) declaration without leaving fragments", () => {
    const out = sanitizeHtmlFragment(
      '<span style="font-size:22px; background-image:url(data:image/svg+xml;base64,AAA); color:#fff">x</span>',
    );
    expect(out).not.toMatch(/url\s*\(/i);
    expect(out).not.toMatch(/base64/i);
    expect(out).toMatch(/font-size:\s*22px/);
    expect(out).toMatch(/color:\s*#fff/);
  });
});

"use client";

import { useEffect, useRef, useState } from "react";
import { labels } from "@/lib/form-labels";
import type { Locale } from "@/lib/i18n";

/**
 * Static rebuild of the imweb inquiry form (notices page).
 * Geometry measured from the live original: 18px/700 labels, h50 inputs
 * with 1px rgba(0,0,0,.1) borders, 40px row gaps, 2-col grid for the
 * first four fields, 195x51 #363636 submit button.
 */
export default function InquiryForm({ locale }: { locale: Locale }) {
  const t = labels[locale];
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDone(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  // Original mobile (390) measured from the live /27 form screenshot: the form
  // is a centred 250px column, inputs are 33px tall and textareas 82px; the
  // desktop geometry (50px inputs, full width) is restored at >=992px.
  const inputCls =
    "h-[33px] w-full border border-black/10 bg-white px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent min-[992px]:h-[50px] min-[992px]:px-4";

  const areaCls =
    "h-[82px] w-full resize-none border border-black/10 bg-white px-4 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent min-[992px]:h-[50px]";

  const req = (
    <span aria-hidden className="ml-1 inline-block h-[6px] w-[6px] rounded-full bg-[#ee3a3a] align-middle" />
  );

  const labelCls = "flex h-[22px] items-center text-[15px] font-bold text-ink min-[992px]:h-[29px] min-[992px]:text-[18px]";

  return (
    <>
      <form
        className="mx-auto max-w-[250px] min-[992px]:max-w-none"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(true);
        }}
      >
        {/* 2-col grid: company/contact, phone/email */}
        <div className="grid grid-cols-1 gap-x-[30px] gap-y-[20px] lg:grid-cols-2 min-[992px]:gap-y-10">
          <div>
            <label className={labelCls} htmlFor="inq-company">
              {t.company}
              {req}
            </label>
            <input id="inq-company" name="company" required placeholder={t.companyPh} className={`${inputCls} mt-[5px]`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="inq-contact">
              {t.contact}
              {req}
            </label>
            <input id="inq-contact" name="contact" required placeholder={t.contactPh} className={`${inputCls} mt-[5px]`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="inq-phone">
              {t.phone}
              {req}
            </label>
            <input id="inq-phone" name="phone" required placeholder={t.phonePh} className={`${inputCls} mt-[5px]`} />
          </div>
          <div>
            <label className={labelCls} htmlFor="inq-email">
              {t.email}
              {req}
            </label>
            <input
              id="inq-email"
              name="email"
              type="email"
              required
              placeholder={t.emailPh}
              className={`${inputCls} mt-[5px]`}
            />
          </div>
        </div>

        {/* address */}
        <div className="mt-[20px] min-[992px]:mt-10">
          <label className={labelCls} htmlFor="inq-address">
            {t.address}
          </label>
          <textarea
            id="inq-address"
            name="address"
            rows={3}
            placeholder={t.addressPh}
            className={`mt-[5px] ${areaCls}`}
          />
        </div>

        {/* products checkboxes */}
        <fieldset className="mt-[20px] min-[992px]:mt-10">
          <legend className={labelCls}>{t.products}</legend>
          <div className="mt-[5px] space-y-0 text-[15px] text-ink">
            {t.productOptions.map((opt) => (
              <label key={opt} className="flex h-[38px] cursor-pointer items-center gap-2">
                <input type="checkbox" name="products" value={opt} className="h-4 w-4 accent-[#3465de]" />
                {opt}
              </label>
            ))}
            <div className="flex h-[38px] items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="products" value="etc" className="h-4 w-4 accent-[#3465de]" />
                {t.etcPrefix}:
              </label>
              <input
                name="products_etc"
                placeholder={t.etcPh}
                aria-label={t.etcPh}
                className="h-[33px] w-[122px] border border-black/10 bg-white px-3 text-[15px] outline-none placeholder:text-muted focus:border-accent min-[992px]:h-10 min-[992px]:w-56"
              />
            </div>
          </div>
        </fieldset>

        {/* oem/odm checkboxes */}
        <fieldset className="mt-[40px] min-[992px]:mt-10">
          <legend className={labelCls}>{t.oem}</legend>
          <div className="mt-[5px] text-[15px] text-ink">
            {t.oemOptions.map((opt) => (
              <label key={opt} className="flex h-[38px] cursor-pointer items-center gap-2">
                <input type="checkbox" name="oem" value={opt} className="h-4 w-4 accent-[#3465de]" />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>

        {/* inquiry */}
        <div className="mt-[34px] min-[992px]:mt-10">
          <label className={labelCls} htmlFor="inq-body">
            {t.inquiry}
          </label>
          <textarea
            id="inq-body"
            name="inquiry"
            rows={3}
            placeholder={t.inquiryPh}
            className={`mt-[5px] ${areaCls}`}
          />
        </div>

        {/* file */}
        <div className="mt-[21px] min-[992px]:mt-10">
          <span className={labelCls}>{t.file}</span>
          <div className="mt-[5px]">
            <input
              ref={fileRef}
              type="file"
              name="file"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 border border-black/10 bg-white px-5 text-[15px] text-ink transition-colors hover:border-accent hover:text-accent"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
              </svg>
              {fileName || t.fileBtn}
            </button>
          </div>
        </div>

        {/* consent */}
        <div className="mt-[36px] min-[992px]:mt-10">
          <span className={labelCls}>
            {t.consentTitle}
            {req}
          </span>
          <div className="mt-[5px] h-[159px] overflow-y-auto border border-black/10 bg-white p-4 text-[13px] leading-[1.7] text-body min-[992px]:h-[150px]">
            {t.consentText.split("\n").map((line, i) => (
              <p key={i} className={line ? "mb-2" : "mb-4"}>
                {line}
              </p>
            ))}
          </div>
          <label className="mt-[19px] flex cursor-pointer items-center gap-2 text-[15px] text-ink min-[992px]:mt-3">
            <input type="checkbox" required className="h-4 w-4 accent-[#3465de]" />
            {t.agree}
          </label>
        </div>

        {/* submit */}
        <div className="mt-[35px] text-center min-[992px]:mt-10">
          <button
            type="submit"
            className="h-[51px] w-[195px] bg-[#363636] text-[20px] text-white transition-colors hover:bg-accent"
          >
            {t.submit}
          </button>
        </div>
      </form>

      {done && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.success}
        >
          <div className="w-full max-w-sm bg-white p-10 text-center">
            <p className="text-[16px] text-ink">{t.success}</p>
            <button
              type="button"
              onClick={() => setDone(false)}
              className="mt-6 h-11 w-[120px] bg-[#363636] text-[15px] text-white transition-colors hover:bg-accent"
            >
              {t.confirm}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

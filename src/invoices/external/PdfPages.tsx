import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fitPdfPageWidth, orderedPdfPages } from "./pdf-pages";
import { useTranslation } from "react-i18next";

GlobalWorkerOptions.workerSrc = workerUrl;

function Page({ document, number, signature }: { document: PDFDocumentProxy; number: number; signature?: string }) {
  const { t } = useTranslation();
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = wrapper.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { rootMargin: "600px" });
    observer.observe(node);
    const resize = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    resize.observe(node);
    return () => { observer.disconnect(); resize.disconnect(); };
  }, []);

  useEffect(() => {
    if (!visible || !width || !canvas.current) return;
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    document.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = fitPdfPageWidth(width, natural.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      const element = canvas.current;
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      element.style.height = `${Math.ceil(natural.height * scale)}px`;
      const context = element.getContext("2d");
      if (!context) throw new Error(t("pdf.canvasUnavailable"));
      task = page.render({ canvasContext: context, viewport });
      return task.promise;
    }).catch((reason: unknown) => {
      if (!cancelled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
        setError("pdf.pageFailed");
      }
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, number, visible, width, t]);

  return <section className="invoice-pdf-page" ref={wrapper} aria-label={t("pdf.pageLabel", { number })}>
    <canvas ref={canvas} aria-hidden="true" />
    {signature ? <img className="invoice-source-signature" src={signature} alt={t("pdf.savedSignature")} /> : null}
    {error ? <p role="alert">{t(error)}</p> : null}
    <small>{t("pdf.pageNumber", { number })}</small>
  </section>;
}

export default function PdfPages({ url, signature }: { url: string; signature?: string }) {
  const { t } = useTranslation();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setDocument(null);
    setError("");
    const loading = getDocument({ url, useSystemFonts: true });
    loading.promise.then((result) => {
      if (active) setDocument(result);
      else void result.destroy();
    }).catch(() => {
      if (active) setError("pdf.previewFailed");
    });
    return () => { active = false; void loading.destroy(); };
  }, [url]);

  if (error) return <div className="invoice-document-empty" role="alert">{t(error)}</div>;
  if (!document) return <div className="invoice-document-empty" role="status">{t("pdf.loadingPages")}</div>;
  return <div className="invoice-pdf-pages" aria-label={t("pdf.totalPages", { count: document.numPages })}>
    {orderedPdfPages(document.numPages).map((number) => <Page key={number} document={document} number={number} signature={number === 1 ? signature : undefined} />)}
  </div>;
}

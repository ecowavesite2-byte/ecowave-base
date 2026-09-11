/** Renders crawled rich-text HTML (imweb fr-view fragments) with inline styles intact. */
export default function RichText({ html, className = "" }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

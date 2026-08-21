/** Troca tags estruturais por quebras de linha antes da extração de texto,
 *  para que `<br>`, `<p>`, `<li>` etc. não achatem o conteúdo numa linha só
 *  (thread do PR #1; mesma classe corrigida no admin-app#516). */
const structuralTagsToLineBreaks = (html: string): string =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');

const normalize = (text: string): string =>
  text
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const htmlToPlainText = (html: string): string => {
  const safeHtml = structuralTagsToLineBreaks(html);
  if (typeof DOMParser === 'undefined') {
    // Fallback sem DOM: remove tags até estabilizar (uma passada única
    // deixaria `<scr<script>ipt>` recompor uma tag) e decodifica as
    // entidades básicas.
    let text = safeHtml;
    let previous: string;
    do {
      previous = text;
      text = text.replace(/<[^>]*>/g, '');
    } while (text !== previous);
    return normalize(
      text.split('&nbsp;').join(' ').split('&quot;').join('"').split('&#39;').join("'").split('&amp;').join('&'),
    );
  }

  const doc = new DOMParser().parseFromString(safeHtml, 'text/html');
  return normalize(doc.body.textContent ?? '');
};

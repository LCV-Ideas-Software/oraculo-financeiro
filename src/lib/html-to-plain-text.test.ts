import { describe, expect, it } from 'vitest';
import { htmlToPlainText } from './html-to-plain-text';

// Thread do PR #1 (mesma classe do admin-app#516): a extração por textContent
// puro colapsava parágrafos, listas e cabeçalhos numa linha só — a análise da
// IA virava um bloco ilegível no texto gerado.
describe('htmlToPlainText', () => {
  it('preserva quebras estruturais de parágrafos, listas e cabeçalhos', () => {
    const html = '<h2>Título</h2><p>Primeiro parágrafo.</p><ul><li>Item um</li><li>Item dois</li></ul>';
    expect(htmlToPlainText(html)).toBe('Título\nPrimeiro parágrafo.\nItem um\nItem dois');
  });

  it('converte <br> e <br/> em quebra de linha', () => {
    expect(htmlToPlainText('linha um<br>linha dois<br/>linha três')).toBe('linha um\nlinha dois\nlinha três');
  });

  it('decodifica entidades básicas e normaliza nbsp', () => {
    expect(htmlToPlainText('<p>a&nbsp;&amp;&nbsp;b &quot;c&quot; &#39;d&#39;</p>')).toBe('a & b "c" \'d\'');
  });

  it('colapsa três ou mais quebras consecutivas em duas', () => {
    expect(htmlToPlainText('<p>um</p><p></p><p></p><p>dois</p>')).toBe('um\n\ndois');
  });

  it('remove tags aninhadas maliciosas até estabilizar', () => {
    expect(htmlToPlainText('<scr<script>ipt>alert(1)</scr</script>ipt>')).toBe('ipt>alert(1)ipt>');
  });
});

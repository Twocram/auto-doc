const PizZip = require('/tmp/xlsxgen/node_modules/pizzip');
const fs = require('fs');

const jobs = {
  'templates/marked.docx': {
    2: '{contractNumber}',
    4: ' «{contractDay}» {contractMonth}',
    11: '{executorFullName}',
    149: '{executorRequisites}',
    152: '{contractNumber}',
    154: '{contractDateFormatted}',
    155: ' г. ',
    159: '{contractDay}',
    162: '{contractMonth}',
    168: '{executorFullName}',
    173: '{clientFull} (ИНН {clientInn}, ОГРН {clientOgrn}), в рамках проекта «{project}»',
    187: '{channelName}',
    189: 'на канале Telegram «{channelName}» ({channelUrl})',
    191: '{placementDate} ',
    192: 'с {placementDate} ',
    193: 'по {placementEndDate} / {placementDays} дней',
    194: '',
    195: '{price}',
    206: '',
    207: '{clientShort}',
    208: '',
    211: '{clientOgrn}',
    215: '{clientInn}',
    230: '{price} ',
    232: '{priceWords}',
    236: '{vatClause} ',
    237: '',
    238: '',
    262: '/ {executorShort}',
  },
  'templates/unmarked.docx': {
    2: '{contractNumber}',
    4: ' «{contractDay}» {contractMonth}',
    10: '{executorFullName}',
    139: '{executorRequisites}',
    143: '{contractNumber}',
    145: '{contractDateFormatted}',
    146: ' г. ',
    149: '{contractDay}',
    151: '{contractMonth}',
    157: '{executorFullName}',
    164: '{clientFull},',
    177: 'на канале Telegram «{channelName}» ({channelUrl})',
    179: '{placementDate} ',
    180: 'с {placementDate} ',
    181: 'по {placementEndDate} / {placementDays} дней',
    182: '',
    183: '{price}',
    203: '{price} ',
    205: '{priceWords}',
    209: '{vatClause} ',
    210: '',
    211: '',
    242: '{executorShort}',
  },
};

for (const [file, replacements] of Object.entries(jobs)) {
  const path = './' + file;
  const zip = new PizZip(fs.readFileSync(path));
  let xml = zip.file('word/document.xml').asText();
  let idx = -1;
  xml = xml.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (m, open, text, close) => {
    idx++;
    return idx in replacements ? open + replacements[idx] + close : m;
  });

  xml = xml.replace(/<w:highlight[^/]*\/>/g, '');
  if (file.includes('marked')) xml = xml.replace('Заказчик / Исполнитель.', '{ordParty}.');

  // в абзаце с {vatClause} исходные варианты НДС разделены <w:br/> — убираем, чтобы не было дыры
  const vatIdx = xml.indexOf('{vatClause}');
  const pStart = xml.lastIndexOf('<w:p ', vatIdx);
  const pEnd = xml.indexOf('</w:p>', vatIdx) + 6;
  const p = xml.slice(pStart, pEnd).replace(/<w:br[^>]*\/>/g, '').replace(/<w:t[^>]*>\s*<\/w:t>/g, '');
  const patched = xml.slice(0, pStart) + p + xml.slice(pEnd);
  zip.file('word/document.xml', patched);
  fs.writeFileSync(path, zip.generate({ type: 'nodebuffer' }));

  const runs = [...patched.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
  const tags = runs.filter(t => /\{[a-zA-Z]+\}/.test(t));
  const leftovers = runs.filter(t => /_{2,}|00\.00\.00/.test(t));
  console.log(file, '| tags:', tags.length, '| leftover blanks:', leftovers.length);
  leftovers.forEach(t => console.log('  left:', JSON.stringify(t)));
}

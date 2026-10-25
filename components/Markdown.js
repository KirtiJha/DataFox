/**
 * Minimal Markdown for assistant replies: paragraphs, headings, bullet and
 * numbered lists, tables, fenced code, `inline code`, **bold** and *italic*.
 * Builds React elements (never HTML strings), so model output can't inject markup.
 */

function renderInline(text, keyPrefix) {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("`")) {
      parts.push(
        <code key={key} className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[0.85em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const splitRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export default function Markdown({ text }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blocks.length}`;

    if (line.trim().startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key} className="my-2 p-2 rounded-md bg-gray-100 dark:bg-gray-900 text-xs font-mono overflow-x-auto whitespace-pre">
          {code.join("\n")}
        </pre>
      );
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={key} className="my-2 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className="px-2 py-1 text-left font-medium border-b border-gray-200 dark:border-gray-600">
                    {renderInline(cell, `${key}h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="px-2 py-1 border-b border-gray-100 dark:border-gray-700">
                      {renderInline(cell, `${key}r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={key} className="mt-3 mb-1 font-semibold">
          {renderInline(heading[2], key)}
        </p>
      );
      i++;
      continue;
    }

    const listMatch = line.match(/^\s*([-*•]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={`my-1 pl-5 space-y-0.5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, n) => (
            <li key={n}>{renderInline(item, `${key}-${n}`)}</li>
          ))}
        </List>
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      paragraph.push(lines[i++]);
    }
    blocks.push(
      <p key={key} className="my-1.5">
        {renderInline(paragraph.join(" "), key)}
      </p>
    );
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

import {
  TerminalCard,
  TerminalCardBody,
  TerminalCardHeader,
  TerminalCardTitle,
} from "@/components/ui/terminal-card";
import { SourceBadge } from "@/components/ui/source-badge";
import { copy } from "@/lib/copy";
import { formatNumber, formatRelative } from "@/lib/format";
import {
  getAllTickers,
  getSourceSummary,
  type AllTickerRow,
  type SourceSummaryRow,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  stock: copy.sourcesTickerCategoryStock,
  crypto: copy.sourcesTickerCategoryCrypto,
  "ai-keyword": copy.sourcesTickerCategoryAi,
};

// Wraps any read-only DB call so a missing/empty DB never crashes the page (matches layout.tsx pattern).
function safeQuery<T>(label: string, fn: () => T[]): T[] {
  try {
    return fn();
  } catch (err) {
    console.error(`[sources] failed to load ${label}`, err);
    return [];
  }
}

type Column = {
  key: string;
  label: string;
  align?: "start" | "end";
};

function TableCard<Row>({
  title,
  count,
  columns,
  rows,
  rowKey,
  renderCell,
}: {
  title: string;
  count: number;
  columns: Column[];
  rows: Row[];
  rowKey: (row: Row) => string;
  renderCell: (row: Row, col: Column) => React.ReactNode;
}) {
  return (
    <TerminalCard>
      <TerminalCardHeader>
        <TerminalCardTitle>{title}</TerminalCardTitle>
        <span className="text-[11px] text-[#787B86] font-mono tabular-nums">
          {formatNumber(count)}
        </span>
      </TerminalCardHeader>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-3 text-[12px] text-[#787B86]">{copy.errorNoData}</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#787B86] bg-[#1E222D]">
              <tr className="border-b border-[#2A2E39]">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-1.5 font-normal ${
                      col.align === "end" ? "text-end" : "text-start"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-t border-[#2A2E39]">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-1.5 ${
                        col.align === "end" ? "text-end" : ""
                      }`}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TerminalCard>
  );
}

const SOURCE_COLUMNS: Column[] = [
  { key: "type", label: copy.sourcesColType },
  { key: "handle", label: copy.sourcesColHandle },
  { key: "status", label: copy.sourcesColStatus },
  { key: "lastSync", label: copy.sourcesColLastSync },
  { key: "items", label: copy.sourcesColItems, align: "end" },
];

const TICKER_COLUMNS: Column[] = [
  { key: "symbol", label: copy.sourcesTickerColSymbol },
  { key: "name", label: copy.sourcesTickerColName },
  { key: "category", label: copy.sourcesTickerColCategory },
];

function renderSourceCell(row: SourceSummaryRow, col: Column): React.ReactNode {
  switch (col.key) {
    case "type":
      return <SourceBadge source={row.source_type} />;
    case "handle":
      return (
        <span className="font-mono tabular-nums text-[#D1D4DC]">
          {row.handle}
        </span>
      );
    case "status": {
      const enabled = row.enabled === 1;
      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 text-[11px] rounded-sm ${
            enabled
              ? "bg-[#26A69A]/20 text-[#26A69A]"
              : "bg-[#363A45] text-[#787B86]"
          }`}
        >
          {enabled ? copy.sourcesToggleEnable : copy.sourcesToggleDisable}
        </span>
      );
    }
    case "lastSync":
      return (
        <span className="font-mono tabular-nums text-[#787B86]">
          {row.last_synced_at
            ? formatRelative(row.last_synced_at)
            : copy.sourcesNever}
        </span>
      );
    case "items":
      return (
        <span className="font-mono tabular-nums text-[#D1D4DC]">
          {formatNumber(row.item_count)}
        </span>
      );
    default:
      return null;
  }
}

function renderTickerCell(row: AllTickerRow, col: Column): React.ReactNode {
  switch (col.key) {
    case "symbol":
      return (
        <span className="font-mono tabular-nums text-[#D1D4DC]">
          {row.symbol}
        </span>
      );
    case "name":
      return <span className="text-[#D1D4DC]">{row.name}</span>;
    case "category":
      return (
        <span className="text-[#787B86]">
          {CATEGORY_LABEL[row.category] ?? row.category}
        </span>
      );
    default:
      return null;
  }
}

export default function SourcesPage() {
  const sources = safeQuery("source summary", getSourceSummary);
  const tickers = safeQuery("tickers", getAllTickers);

  return (
    <div className="p-3 space-y-3 min-h-full">
      <TableCard<SourceSummaryRow>
        title={copy.sourcesTitle}
        count={sources.length}
        columns={SOURCE_COLUMNS}
        rows={sources}
        rowKey={(row) => `${row.source_type}-${row.handle}`}
        renderCell={renderSourceCell}
      />

      <TableCard<AllTickerRow>
        title={copy.sourcesTickersTitle}
        count={tickers.length}
        columns={TICKER_COLUMNS}
        rows={tickers}
        rowKey={(row) => row.symbol}
        renderCell={renderTickerCell}
      />

      <TerminalCard>
        <TerminalCardBody>
          <p className="text-[11px] text-[#787B86]">
            {copy.sourcesReadOnlyNote}
          </p>
        </TerminalCardBody>
      </TerminalCard>
    </div>
  );
}

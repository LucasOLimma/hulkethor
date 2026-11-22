"use client";

import { useEffect, useRef, useState } from "react";

// Graficos simples em SVG (sem bibliotecas). Uma serie por grafico,
// cor dourada; texto sempre em cor de texto; grade discreta; detalhe ao
// passar o mouse/tocar; tabela com os mesmos dados para acessibilidade.

type Point = { key: string; label: string; value: number };

// Formatos prontos (funcoes nao podem vir do servidor para o navegador).
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("pt-BR");
const FORMATS = {
  brl: { value: (v: number) => brl.format(v), axis: (v: number) => brlCompact.format(v) },
  reservas: { value: (v: number) => `${int.format(v)} reserva${v === 1 ? "" : "s"}`, axis: (v: number) => int.format(v) },
};

const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 56 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function TimeChart({
  kind,
  data,
  title,
  valueType,
  emptyText,
}: {
  kind: "column" | "line";
  data: Point[];
  title: string;
  valueType: keyof typeof FORMATS;
  emptyText: string;
}) {
  const format = FORMATS[valueType].value;
  const axisFormat = FORMATS[valueType].axis;
  const wrapRef = useRef<HTMLDivElement>(null);
  // null ate medir o espaco: o grafico so e desenhado no navegador (evita
  // diferenca de formatacao de numeros entre servidor e navegador)
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? 640;
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMeasured(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.length;
  // eixo de quantidade so com numeros inteiros
  const max = valueType === "reservas" ? Math.max(4, Math.ceil(niceMax(Math.max(0, ...data.map((d) => d.value))) / 4) * 4) : niceMax(Math.max(0, ...data.map((d) => d.value)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, n);
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const allZero = data.every((d) => d.value === 0);
  // sem dados: so a linha do zero (nada de valores de eixo inventados)
  const ticks = allZero ? [0] : [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const barW = Math.max(2, Math.min(24, slot * 0.62));
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(innerW / 70)));

  const onMove = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = Math.floor((clientX - rect.left - PAD.left) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };

  const linePath = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join("");
  const areaPath = `${linePath}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div
        ref={wrapRef}
        className="chart-plot"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
      >
        {measured === null ? (
          <div style={{ height: H }} aria-hidden="true" />
        ) : (
        <svg width={width} height={H} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={d.key} x={x(i)} y={H - 8} className="chart-axis" textAnchor="middle">
                {d.label}
              </text>
            ) : null,
          )}

          {kind === "column" &&
            data.map((d, i) => {
              if (d.value <= 0) return null;
              const top = y(d.value);
              const hgt = y(0) - top;
              const r = Math.min(4, hgt, barW / 2);
              const x0 = x(i) - barW / 2;
              // topo arredondado (4px), base reta
              const path = `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${y(0)}Z`;
              return <path key={d.key} d={path} className={hover === i ? "chart-mark active" : "chart-mark"} />;
            })}

          {kind === "line" && !allZero && (
            <>
              <path d={areaPath} className="chart-area" />
              <path d={linePath} className="chart-line" />
            </>
          )}

          {h && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} className="chart-crosshair" />
              {kind === "line" && <circle cx={x(hover)} cy={y(h.value)} r={5} className="chart-dot" />}
            </>
          )}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
        </svg>
        )}

        {allZero && measured !== null && <p className="chart-empty">{emptyText}</p>}

        {h && hover !== null && (
          <div
            className="chart-tooltip"
            style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: Math.max(4, y(h.value) - 54) }}
          >
            <span>{h.label}</span>
            <strong>{format(h.value)}</strong>
          </div>
        )}
      </div>

      {measured !== null && (
      <details className="chart-table">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td>{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      )}
    </div>
  );
}

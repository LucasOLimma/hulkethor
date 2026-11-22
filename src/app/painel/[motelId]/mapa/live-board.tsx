"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { forecast, readyText, toMs, viewSuite, type Board } from "@/lib/board";
import { loadBoard } from "./actions";

const REFRESH_MS = 20_000;

export function LiveBoard({ motelId, initial, showForecast }: { motelId: string; initial: Board; showForecast: boolean }) {
  const [board, setBoard] = useState(initial);
  // relogio: horario do motel (vindo do servidor) + o tempo que passou aqui
  const [loadedAt, setLoadedAt] = useState(() => ({ server: toMs(initial.now), client: Date.now() }));
  const [tick, setTick] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // atualiza: a cada 20 s e, com o tempo real, sempre que algo muda
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const b = await loadBoard(motelId).catch(() => null);
      if (!alive) return;
      if (!b) return setFailed(true);
      setFailed(false);
      setBoard(b);
      setLoadedAt({ server: toMs(b.now), client: Date.now() });
    };
    const soon = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(refresh, 600);
    };
    const timer = setInterval(refresh, REFRESH_MS);

    // tempo real do Supabase (respeita as regras de seguranca do banco)
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const supabase = createClient();
    try {
      channel = supabase
        .channel(`mapa-${motelId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "housekeeping_tasks", filter: `motel_id=eq.${motelId}` }, soon)
        .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `motel_id=eq.${motelId}` }, soon)
        .subscribe((status) => {
          if (alive) setLive(status === "SUBSCRIBED");
        });
    } catch {
      // sem tempo real: continua atualizando a cada 20 s
    }
    // volta para a aba: atualiza na hora
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      if (pending.current) clearTimeout(pending.current);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [motelId]);

  // relogio de 1 em 1 s (cronometros)
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowMs = loadedAt.server + (tick - loadedAt.client);
  const views = useMemo(() => board.suites.map((s) => viewSuite(s, nowMs, board.motel_avg_min)), [board, nowMs]);
  const fc = useMemo(() => forecast(views), [views]);
  const counts = {
    azul: views.filter((v) => v.color === "azul").length,
    amarelo: views.filter((v) => v.color === "amarelo").length,
    verde: views.filter((v) => v.color === "verde").length,
    vermelho: views.filter((v) => v.color === "vermelho").length,
  };
  const ago = Math.max(0, Math.round((tick - loadedAt.client) / 1000));

  return (
    <div className="board">
      <div className="board-bar">
        <ul className="board-legend">
          <li className="c-azul"><b>{counts.azul}</b> {counts.azul === 1 ? "ocupada" : "ocupadas"}</li>
          <li className="c-amarelo"><b>{counts.amarelo}</b> em limpeza</li>
          <li className="c-verde"><b>{counts.verde}</b> {counts.verde === 1 ? "pronta" : "prontas"}</li>
          {counts.vermelho > 0 && <li className="c-vermelho"><b>{counts.vermelho}</b> com problema</li>}
        </ul>
        <span className={`board-live ${live ? "on" : ""}`} title={live ? "Recebendo mudanças em tempo real" : "Atualizando a cada 20 segundos"}>
          <i aria-hidden="true" /> {live ? "Ao vivo" : ago < 5 ? "Atualizado agora" : `Atualizado há ${ago} s`}
        </span>
      </div>
      {failed && <p className="alert error" role="alert">Sem conexão agora. Tentando de novo…</p>}

      {showForecast && (
        <section className="board-forecast" aria-label="Previsão">
          {fc.free > 0 ? (
            <p>
              <strong>{fc.free} {fc.free === 1 ? "suíte pronta" : "suítes prontas"} agora</strong>
              {fc.freeNoReservation < fc.free && ` (${fc.free - fc.freeNoReservation} com reserva mais tarde hoje)`}.
            </p>
          ) : fc.next.length > 0 ? (
            <p>
              <strong>Nenhuma suíte pronta agora.</strong> Próxima: <strong>Suíte {fc.next[0].suite.number}</strong>{" "}
              {readyText(fc.next[0].readyAt!, nowMs)}.
            </p>
          ) : (
            <p><strong>Nenhuma suíte pronta agora</strong> e nenhuma previsão disponível.</p>
          )}
          {fc.next.length > 0 && (
            <ol className="board-next">
              {fc.next.map((v) => (
                <li key={v.suite.id}>
                  Suíte <b>{v.suite.number}</b> {readyText(v.readyAt!, nowMs)}
                  <small> · {v.suite.status === "limpeza" ? "em limpeza" : "ocupada"}</small>
                </li>
              ))}
            </ol>
          )}
          <p className="board-note">
            A previsão usa o tempo médio real de limpeza de cada suíte nos últimos 30 dias
            {board.motel_avg_min ? ` (média do motel: ${board.motel_avg_min} min)` : " (ainda sem histórico: usando 30 min)"}.
          </p>
        </section>
      )}

      <ul className="board-grid">
        {views.map((v) => (
          <li key={v.suite.id} className={`board-cell c-${v.color} ${v.late ? "late" : ""}`}>
            <div className="board-cell-head">
              <strong>{v.suite.number}</strong>
              <span>{v.label}</span>
            </div>
            <small className="board-type">{v.suite.type}</small>
            {v.detail && <p className="board-detail">{v.detail}</p>}
            {v.progress !== null && (
              <div className="board-progress" role="progressbar" aria-valuenow={Math.round(v.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Limpeza da suíte ${v.suite.number}`}>
                <i style={{ width: `${Math.round(v.progress * 100)}%` }} />
              </div>
            )}
            {showForecast && v.readyAt !== null && v.suite.status !== "livre" && (
              <p className="board-ready">Pronta {readyText(v.readyAt, nowMs)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

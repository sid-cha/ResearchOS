# v0.13 Monitor Price & Activity — completed daily candlesticks

Status: draft local-first charting feature; not an intraday candle or predictive trading engine.

## Why

In LIVE mode, sparse latest IEX trades may not provide enough observed trade samples for an honest price line, creating an empty Monitor panel. A separate supported **historical completed-session daily-bar source** provides real OHLCV without falsely reconstructing one-minute candles from polling snapshots.

## UI

MONITOR → PRICE & ACTIVITY now displays the last observed trade price in the top heading, *independent* of the historical daily chart below. In LIVE and HISTORICAL TRADES modes, the new chart shows:
- 20 / 60 / 120 / 250 **completed IEX daily sessions**. These selectors are trading-session counts, not 1-minute, 5-minute, 15-minute, or 1-hour periods.
- Each candle's open/high/low/close and associated daily IEX volume (SVG hover title).
- 20-session and 50-session simple moving averages when sufficient daily candles exist, plus most recent completed daily close and relative volume against the preceding 20 loaded sessions.
- Provenance: `ALPACA_IEX`, single venue, 1-day, split-adjusted, last completed NY session, partial-history flags.
- Distinct unavailable/timeout messages when the entitled provider returns no data.

In DEMO mode the original synthetic replay line chart is **unchanged**, and newly added daily controls are hidden. Daily completed bars do not update with each SSE trade; chart responses are cached briefly. No AI prediction or data inference is performed.

## Read-only API

`GET /api/chart/daily?symbol=NVDA&sessions=60`

Allowed symbols: existing ten-symbol pilot. Allowed windows: 20, 60, 120, 250. Server uses its own Alpaca credentials and existing `researchBars` adapter with `feed=iex`, `adjustment=split`. Result uses `HISTORICAL_COMPLETED_DAILY_BARS` and has `includesLivePrice:false`; no secrets reach the browser.

The server filters uncompleted sessions using the **America/New_York** calendar date and validates numerical OHLCV relationships. Incomplete windows, malformed data or unavailable entitlements are surfaced. Historical data and live observations are not merged into one series or labeled as consolidated.

## Verification

```powershell
cd apps/tradescope
npm.cmd test
npm.cmd start
```

Run the historical daily chart in LIVE mode and verify last completed date, no mixing of quote/trade observations, selected security changes, source availability and dark/light contrast. Confirm DEMO replay chart still works. Test poor connectivity and missing Alpaca entitlements.

**Still pending:** real authenticated Alpaca IEX daily-bar response, live browser interaction/hover/accessibility checks, precise intraday OHLCV intervals (1m/5m/15m/1h) requiring a separately supported source and chart controls, and volume-by-price or order-book algorithms.

This increment deliberately uses a CSP-safe dependency-free SVG instead of importing a library that would need vendor asset and license review. A later charting-library migration may use TradingView Lightweight Charts while retaining this versioned OHLCV contract.

No merge or deployment automatically.

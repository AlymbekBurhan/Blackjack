import React, { useEffect, useMemo, useState, useRef } from "react";

// --- Card + Shoe helpers ----------------------------------------------------
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildShoe(numDecks = 6) {
  const shoe = [];
  for (let d = 0; d < numDecks; d++) {
    for (const r of RANKS) {
      for (const s of SUITS) {
        shoe.push({ r, s });
      }
    }
  }
  // shuffle
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function cardValue(rank) {
  if (["J", "Q", "K"].includes(rank)) return 10;
  if (rank === "A") return 11;
  return parseInt(rank, 10);
}

// safer total: ignores any accidental undefined
function totalOf(hand) {
  const safe = (hand || []).filter(Boolean);
  let total = safe.reduce((acc, c) => acc + cardValue(c.r), 0);
  let aces = safe.filter((c) => c.r === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(hand) {
  const safe = (hand || []).filter(Boolean);
  return safe.length === 2 && totalOf(safe) === 21;
}

// --- Pretty Card component ---------------------------------------------------
function Card({ r, s, delay = 0 }) {
  const isRed = s === "♥" || s === "♦";
  return (
    <div
      className={`deal-in w-14 h-20 rounded-xl shadow-md bg-white border border-neutral-200 flex flex-col justify-between p-2 select-none ${
        isRed ? "text-red-600" : "text-neutral-900"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-sm font-semibold">{r}</div>
      <div className="text-center text-lg">{s}</div>
      <div className="text-sm font-semibold text-right">{r}</div>
    </div>
  );
}

function Hand({ title, cards, hideSecond = false, totalLabel = true }) {
  const shown = hideSecond && cards.length > 1 ? [cards[0]] : cards;
  const total = totalOf(shown);
  return (
    <div className="space-y-2">
      <div className="text-sm uppercase tracking-wide text-neutral-400">{title}</div>
      <div className="flex gap-2 items-center">
        {shown.map((c, i) => (
          <Card key={i + c.r + c.s} r={c.r} s={c.s} delay={i * 80} />
        ))}
        {hideSecond && cards.length > 1 && (
          <div className="deal-in w-14 h-20 rounded-xl bg-neutral-800/80 border border-neutral-700 shadow-md flex items-center justify-center text-neutral-200">
            ?
          </div>
        )}
      </div>
      {totalLabel && <div className="text-neutral-300 text-sm">Score: {total}</div>}
    </div>
  );
}

// --- Main App ---------------------------------------------------------------
export default function BlackjackApp() {
  // Deck (shoe) stored in a ref so draws are synchronous & reliable
  const [reshuffleAt] = useState(52);          // rebuild threshold
  const shoeRef = useRef([]);                  // mutable shoe
  const [shoeCount, setShoeCount] = useState(0); // UI counter

  // Bankroll persisted to localStorage
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem("bj_balance");
    return saved ? Number(saved) : 100;
  });
  useEffect(() => {
    localStorage.setItem("bj_balance", String(balance));
  }, [balance]);

  // Table state
  const [bet, setBet] = useState(10);
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [phase, setPhase] = useState("betting"); // betting | player | dealer | settle
  const [message, setMessage] = useState("");
  const [canDouble, setCanDouble] = useState(false);

  // Build initial shoe once
  useEffect(() => {
    shoeRef.current = buildShoe(6);
    setShoeCount(shoeRef.current.length);
  }, []);

  // Drawer helpers -----------------------------------------------------------
  function ensureShoe(size = 6) {
    if (!Array.isArray(shoeRef.current)) shoeRef.current = [];
    if (shoeRef.current.length === 0 || shoeRef.current.length <= reshuffleAt) {
      shoeRef.current = buildShoe(size);
    }
  }

  /** Draw exactly n cards synchronously from the shoe */
  function draw(n = 1) {
    const taken = [];
    while (taken.length < n) {
      ensureShoe();
      const card = shoeRef.current.pop();
      if (card) {
        taken.push(card);
      } else {
        // ultra defensive: rebuild and continue
        shoeRef.current = buildShoe(6);
      }
    }
    setShoeCount(shoeRef.current.length);
    return taken;
  }

  const cardsLeft = shoeCount;

  // Actions ------------------------------------------------------------------
  function newRound() {
    if (bet < 1 || bet > balance) {
      setMessage("Pick a valid bet.");
      return;
    }
    setMessage("");

    const [p1, d1, p2, d2] = draw(4);
    const newPlayer = [p1, p2];
    const newDealer = [d1, d2];

    setPlayer(newPlayer);
    setDealer(newDealer);

    const playerBJ = isBlackjack(newPlayer);
    const dealerBJ = isBlackjack(newDealer);

    // First action: allow double if affordable
    setCanDouble(balance >= bet);

    if (playerBJ || dealerBJ) {
      setPhase("settle");
      if (playerBJ && dealerBJ) {
        setMessage("Both Blackjack! Push 🤝");
      } else if (playerBJ) {
        setMessage("Blackjack! You win 3:2 🥳");
        setBalance((b) => b + bet * 1.5);
      } else {
        setMessage("Dealer Blackjack. You lose 💔");
        setBalance((b) => b - bet);
      }
      return;
    }

    setPhase("player");
  }

  function onHit() {
    if (phase !== "player") return;
    const [c] = draw(1);
    const next = [...player, c];
    setPlayer(next);
    setCanDouble(false);

    if (totalOf(next) > 21) {
      setPhase("settle");
      setMessage("You busted. You lose 😢");
      setBalance((b) => b - bet);
    }
  }

  function onStand() {
    if (phase !== "player") return;
    setCanDouble(false);
    setPhase("dealer");

    // Dealer draws to 17+
    let d = [...dealer];
    while (totalOf(d) < 17) {
      d.push(draw(1)[0]);
    }
    setDealer(d);

    // Settle
    const pt = totalOf(player);
    const dt = totalOf(d);

    if (dt > 21) {
      setMessage("Dealer busts. You win! 🎉");
      setBalance((b) => b + bet);
    } else if (pt > dt) {
      setMessage("You win! 😎");
      setBalance((b) => b + bet);
    } else if (pt < dt) {
      setMessage("You lose 💔");
      setBalance((b) => b - bet);
    } else {
      setMessage("Push 🤝");
    }

    setPhase("settle");
  }

  function onDouble() {
    if (phase !== "player" || !canDouble) return;
    if (bet * 2 > balance) {
      setMessage("Not enough balance to double.");
      return;
    }
    setCanDouble(false);

    const [c] = draw(1);
    const next = [...player, c];
    setPlayer(next);

    const doubled = bet * 2;
    const pt = totalOf(next);

    if (pt > 21) {
      setMessage("Busted after double. You lose 💥");
      setBalance((b) => b - doubled);
      setPhase("settle");
      return;
    }

    // Dealer plays
    let d = [...dealer];
    while (totalOf(d) < 17) d.push(draw(1)[0]);
    setDealer(d);

    const dt = totalOf(d);
    if (dt > 21 || pt > dt) {
      setMessage("You win (doubled)! 🤑");
      setBalance((b) => b + doubled);
    } else if (pt < dt) {
      setMessage("You lose (doubled) 💔");
      setBalance((b) => b - doubled);
    } else {
      setMessage("Push on a double 🤝");
    }
    setPhase("settle");
  }

  function resetToBetting() {
    setPlayer([]);
    setDealer([]);
    setMessage("");
    setCanDouble(false);
    setPhase("betting");
  }

  // UI helpers
  const playerScore = useMemo(() => totalOf(player), [player]);
  const dealerScore = useMemo(() => totalOf(dealer), [dealer]);

  return (
    <div className="min-h-screen bg-emerald-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl rounded-3xl bg-emerald-900/40 border border-emerald-800 shadow-xl p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Blackjack</h1>
            <p className="text-sm text-emerald-200/80">6-deck shoe • Dealer hits to 17 • Blackjack pays 3:2</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-emerald-200/80">Balance</div>
            <div className="text-2xl font-bold">${balance}</div>
          </div>
        </div>

        {/* Dealer */}
        <div className="mb-8">
          <Hand title="Dealer" cards={dealer} hideSecond={phase === "player"} />
          {phase !== "player" && dealer.length > 0 && (
            <div className="mt-1 text-emerald-200/90 text-sm">Dealer score: {dealerScore}</div>
          )}
        </div>

        {/* Player */}
        <div className="mb-6">
          <Hand title="You" cards={player} />
          {player.length > 0 && (
            <div className="mt-1 text-emerald-200/90 text-sm">Your score: {playerScore}</div>
          )}
        </div>

        {/* Controls */}
        {phase === "betting" && (
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div>
              <label className="block text-sm mb-1">Bet amount</label>
              <input
                type="number"
                min={1}
                step={1}
                value={bet}
                onChange={(e) => setBet(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                className="px-3 py-2 rounded-lg bg-emerald-800/40 border border-emerald-700 outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <button
              onClick={newRound}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold shadow"
            >
              Deal
            </button>
            <div className="ml-auto text-sm text-emerald-200/80">Cards left in shoe: {cardsLeft}</div>
          </div>
        )}

        {phase === "player" && (
          <div className="flex flex-wrap gap-3">
            <button onClick={onHit} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold shadow">Hit</button>
            <button onClick={onStand} className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 font-semibold shadow">Stand</button>
            <button
              onClick={onDouble}
              disabled={!canDouble}
              className={`px-4 py-2 rounded-xl font-semibold shadow ${canDouble ? "bg-fuchsia-400 hover:bg-fuchsia-300 text-fuchsia-950" : "bg-fuchsia-900/40 text-fuchsia-300 cursor-not-allowed"}`}
            >
              Double
            </button>
          </div>
        )}

        {phase === "settle" && (
          <div className="flex flex-wrap gap-3">
            <button onClick={resetToBetting} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold shadow">New Round</button>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className="mt-6 p-3 rounded-xl bg-emerald-800/40 border border-emerald-700 text-emerald-100">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

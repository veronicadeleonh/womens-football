import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import "./App.css";

// ── Firebase ──────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "womens-football-prediction.firebaseapp.com",
  projectId: "womens-football-prediction",
  storageBucket: "womens-football-prediction.firebasestorage.app",
  messagingSenderId: "800897859811",
  appId: process.env.FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Helpers ───────────────────────────────────────────────────────────────────
const FLAG_API = (name) =>
  `https://flagcdn.com/w40/${COUNTRY_CODES[name] || "xx"}.png`;

const COUNTRY_CODES = {
  "United States": "us", Germany: "de", Sweden: "se", France: "fr",
  England: "gb-eng", Spain: "es", Netherlands: "nl", Brazil: "br",
  Canada: "ca", Australia: "au", Japan: "jp", Norway: "no",
  "China PR": "cn", Denmark: "dk", Italy: "it", "South Korea": "kr",
  Argentina: "ar", Colombia: "co", Nigeria: "ng", "New Zealand": "nz",
  Portugal: "pt", Belgium: "be", Switzerland: "ch", Iceland: "is",
  Austria: "at", Scotland: "gb-sct", "Republic of Ireland": "ie",
  Wales: "gb-wls", Finland: "fi", Poland: "pl", "Czech Republic": "cz",
  Russia: "ru", Ukraine: "ua", Mexico: "mx", "Costa Rica": "cr",
  Chile: "cl", "South Africa": "za", Cameroon: "cm", Ghana: "gh",
  Jamaica: "jm", Haiti: "ht", Panama: "pa", Philippines: "ph",
  Vietnam: "vn", Thailand: "th", "Ivory Coast": "ci", Zambia: "zm",
  Morocco: "ma", Tanzania: "tz", Ethiopia: "et", Uganda: "ug",
  "Korea Republic": "kr", "Chinese Taipei": "tw", Indonesia: "id",
  India: "in", "New Caledonia": "nc", Papua: "pg", Fiji: "fj",
};

function getPrediction(predictions, teamA, teamB) {
  if (!predictions || !teamA || !teamB) return null;
  const key1 = `${teamA}|${teamB}`;
  const key2 = `${teamB}|${teamA}`;
  if (predictions.matchups[key1]) return predictions.matchups[key1];
  if (predictions.matchups[key2]) {
    const m = predictions.matchups[key2];
    return { ...m, team_a: teamA, team_b: teamB, prob_a: m.prob_b, prob_b: m.prob_a };
  }
  // fallback: use elo only
  const ea = predictions.teams[teamA]?.elo || 1500;
  const eb = predictions.teams[teamB]?.elo || 1500;
  const pa = 1 / (1 + Math.pow(10, (eb - ea) / 400));
  return { team_a: teamA, team_b: teamB, prob_a: +pa.toFixed(4), prob_b: +(1 - pa).toFixed(4), elo_a: ea, elo_b: eb };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROUND_LABELS = ["Quarter-finals", "Semi-finals", "Final"];

// ── Components ────────────────────────────────────────────────────────────────
function TeamCard({ team, prob, isSelected, onClick, size = "md" }) {
  const sizeClass = size === "sm" ? "team-card--sm" : size === "lg" ? "team-card--lg" : "";
  return (
    <button
      className={`team-card ${sizeClass} ${isSelected ? "team-card--selected" : ""} ${!team ? "team-card--empty" : ""}`}
      onClick={onClick}
      disabled={!team}
    >
      {team ? (
        <>
          <img
            src={FLAG_API(team)}
            alt={team}
            className="team-flag"
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <span className="team-name">{team}</span>
          {prob !== undefined && (
            <span className="team-prob">{(prob * 100).toFixed(0)}%</span>
          )}
        </>
      ) : (
        <span className="team-empty-label">TBD</span>
      )}
    </button>
  );
}

function Matchup({ teamA, teamB, winner, onSelect, predictions, roundIndex }) {
  const pred = getPrediction(predictions, teamA, teamB);
  const probA = pred?.prob_a;
  const probB = pred?.prob_b;

  return (
    <div className="matchup">
      <div className="matchup-inner">
        <TeamCard
          team={teamA}
          prob={teamA ? probA : undefined}
          isSelected={winner === teamA}
          onClick={() => teamA && onSelect(teamA)}
        />
        <div className="matchup-vs">
          <span>VS</span>
          {pred && teamA && teamB && (
            <div className="matchup-bar">
              <div className="matchup-bar-a" style={{ width: `${(probA * 100).toFixed(0)}%` }} />
            </div>
          )}
        </div>
        <TeamCard
          team={teamB}
          prob={teamB ? probB : undefined}
          isSelected={winner === teamB}
          onClick={() => teamB && onSelect(teamB)}
        />
      </div>
    </div>
  );
}

function BracketColumn({ label, matchups, winners, onSelect, predictions }) {
  return (
    <div className="bracket-col">
      <div className="bracket-col-label">{label}</div>
      <div className="bracket-col-matchups">
        {matchups.map((m, i) => (
          <Matchup
            key={i}
            teamA={m.a}
            teamB={m.b}
            winner={winners[i]}
            onSelect={(team) => onSelect(i, team)}
            predictions={predictions}
          />
        ))}
      </div>
    </div>
  );
}

function BracketStage({ qfTeams, predictions }) {
  // QF: 4 matches → 8 teams
  // SF: 2 matches → winners of QF
  // F:  1 match  → winners of SF

  const [qfWinners, setQfWinners] = useState(Array(4).fill(null));
  const [sfWinners, setSfWinners] = useState(Array(2).fill(null));
  const [fWinner, setFWinner]   = useState(null);
  const [bracketLocked, setBracketLocked] = useState(false);
  const [bracketProb, setBracketProb] = useState(null);
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // reset downstream on change
  const setQF = (i, team) => {
    const next = [...qfWinners];
    next[i] = team;
    setQfWinners(next);
    // clear sf/f if affected
    const sfIdx = Math.floor(i / 2);
    const sfNext = [...sfWinners];
    sfNext[sfIdx] = null;
    setSfWinners(sfNext);
    setFWinner(null);
    setBracketLocked(false);
    setSaved(false);
  };

  const setSF = (i, team) => {
    const next = [...sfWinners];
    next[i] = team;
    setSfWinners(next);
    setFWinner(null);
    setBracketLocked(false);
    setSaved(false);
  };

  const setF = (i, team) => {
    setFWinner(team);
    setBracketLocked(false);
    setSaved(false);
  };

  const qfMatchups = [
    { a: qfTeams[0], b: qfTeams[1] },
    { a: qfTeams[2], b: qfTeams[3] },
    { a: qfTeams[4], b: qfTeams[5] },
    { a: qfTeams[6], b: qfTeams[7] },
  ];

  const sfMatchups = [
    { a: qfWinners[0], b: qfWinners[1] },
    { a: qfWinners[2], b: qfWinners[3] },
  ];

  const fMatchups = [{ a: sfWinners[0], b: sfWinners[1] }];

  const isComplete = qfWinners.every(Boolean) && sfWinners.every(Boolean) && fWinner;

  // Calculate combined probability of this exact bracket
  useEffect(() => {
    if (!isComplete) { setBracketProb(null); return; }
    let prob = 1;
    qfMatchups.forEach((m, i) => {
      const p = getPrediction(predictions, m.a, m.b);
      if (p) prob *= (qfWinners[i] === m.a ? p.prob_a : p.prob_b);
    });
    sfMatchups.forEach((m, i) => {
      if (!m.a || !m.b) return;
      const p = getPrediction(predictions, m.a, m.b);
      if (p) prob *= (sfWinners[i] === m.a ? p.prob_a : p.prob_b);
    });
    if (fMatchups[0].a && fMatchups[0].b) {
      const p = getPrediction(predictions, fMatchups[0].a, fMatchups[0].b);
      if (p) prob *= (fWinner === fMatchups[0].a ? p.prob_a : p.prob_b);
    }
    setBracketProb(prob);
  }, [qfWinners, sfWinners, fWinner]);

  const handleSave = async () => {
    if (!alias.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "predictions"), {
        alias: alias.trim(),
        bracket: { qfWinners, sfWinners, champion: fWinner },
        probability: bracketProb,
        createdAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div className="bracket-wrapper">
      <div className="bracket">
        <BracketColumn
          label="Quarter-finals"
          matchups={qfMatchups}
          winners={qfWinners}
          onSelect={setQF}
          predictions={predictions}
        />
        <BracketColumn
          label="Semi-finals"
          matchups={sfMatchups}
          winners={sfWinners}
          onSelect={setSF}
          predictions={predictions}
        />
        <BracketColumn
          label="Final"
          matchups={fMatchups}
          winners={[fWinner]}
          onSelect={setF}
          predictions={predictions}
        />
        {fWinner && (
          <div className="bracket-champion">
            <div className="champion-label">🏆 Champion</div>
            <TeamCard team={fWinner} size="lg" isSelected />
          </div>
        )}
      </div>

      {isComplete && (
        <div className="save-panel">
          <div className="save-panel-prob">
            <span className="save-panel-prob-label">Bracket probability</span>
            <span className="save-panel-prob-value">
              {(bracketProb * 100).toFixed(4)}%
            </span>
            <span className="save-panel-prob-hint">
              {bracketProb < 0.001
                ? "🔥 Extremely bold pick!"
                : bracketProb < 0.01
                ? "⚡ Daring bracket"
                : bracketProb < 0.05
                ? "🎯 Reasonable but risky"
                : "📊 Stats-friendly bracket"}
            </span>
          </div>
          <div className="save-panel-form">
            <input
              className="save-input"
              placeholder="Your name or alias..."
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              maxLength={30}
            />
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || saved || !alias.trim()}
            >
              {saved ? "✓ Saved!" : saving ? "Saving..." : "Save prediction"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Leaderboard() {
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(collection(db, "predictions"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setPreds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const sorted = [...preds].sort((a, b) => a.probability - b.probability);

  if (loading) return <div className="leaderboard-loading">Loading predictions...</div>;
  if (!preds.length) return (
    <div className="leaderboard-empty">
      No predictions yet — be the first to save yours!
    </div>
  );

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <span>#</span>
        <span>Name</span>
        <span>Champion</span>
        <span>Probability</span>
        <span>Boldness</span>
      </div>
      {sorted.map((p, i) => (
        <div key={p.id} className="leaderboard-row">
          <span className="lb-rank">{i + 1}</span>
          <span className="lb-alias">{p.alias}</span>
          <span className="lb-champion">
            <img
              src={FLAG_API(p.bracket?.champion)}
              alt={p.bracket?.champion}
              className="lb-flag"
              onError={(e) => { e.target.style.display = "none"; }}
            />
            {p.bracket?.champion}
          </span>
          <span className="lb-prob">{(p.probability * 100).toFixed(4)}%</span>
          <span className="lb-boldness">
            {p.probability < 0.001 ? "🔥🔥🔥"
              : p.probability < 0.01 ? "🔥🔥"
              : p.probability < 0.05 ? "🔥"
              : "📊"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [predictions, setPredictions] = useState(null);
  const [tab, setTab] = useState("bracket");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/predictions.json")
      .then((r) => r.json())
      .then((data) => { setPredictions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Pick top 8 teams by Elo for QF
  const qfTeams = predictions
    ? predictions.top_teams.slice(0, 8)
    : Array(8).fill(null);

  return (
    <div className="app">
      {/* Hero */}
      <header className="hero">
        <div className="hero-eyebrow">FIFA Women's World Cup</div>
        <h1 className="hero-title">
          <span className="hero-title-main">Predict the</span>
          <span className="hero-title-accent">Champion</span>
        </h1>
        <p className="hero-sub">
          Build your bracket. See the odds. Dare the stats.
        </p>
        {predictions && (
          <div className="hero-meta">
            Based on <strong>{predictions.meta.total_official_matches.toLocaleString()}</strong> official matches
            · Elo + H2H + Form
          </div>
        )}
      </header>

      {/* Tabs */}
      <nav className="tabs">
        <button
          className={`tab ${tab === "bracket" ? "tab--active" : ""}`}
          onClick={() => setTab("bracket")}
        >
          My Bracket
        </button>
        <button
          className={`tab ${tab === "leaderboard" ? "tab--active" : ""}`}
          onClick={() => setTab("leaderboard")}
        >
          All Predictions
        </button>
      </nav>

      <main className="main">
        {loading ? (
          <div className="loading">Loading predictions data...</div>
        ) : tab === "bracket" ? (
          <BracketStage qfTeams={qfTeams} predictions={predictions} />
        ) : (
          <Leaderboard />
        )}
      </main>

      <footer className="footer">
        Probabilities based on historical data · For entertainment only
      </footer>
    </div>
  );
}

import { useState } from 'react';
import './AiSearch.css';

export function AiSearch() {
  const [query, setQuery] = useState('');
  const [done, setDone] = useState('');
  return (
    <form
      className="rv-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(query.trim());
      }}
    >
      <label className="rv-search-field">
        <span className="rv-ai-dot" aria-hidden="true" />
        <input
          aria-label="Recherche par description"
          placeholder="portrait en lumière douce, fond gris…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDone('');
          }}
        />
      </label>
      <button className="ds-button secondary" type="submit">
        Chercher
      </button>
      <p className="rv-status" role="status">
        {done
          ? `Recherche de démonstration : « ${done} », aucune donnée envoyée.`
          : ''}
      </p>
    </form>
  );
}

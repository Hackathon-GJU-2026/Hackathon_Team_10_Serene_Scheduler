import { useState } from 'react';

function SuggestionCard({ s, onAccept, onDiscuss }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300">
      <div className="flex justify-between items-start">
        <div className="pr-4">
          <div className="text-xs text-gray-400 font-medium tracking-wide">By {s.teacher} • <time dateTime={s.date}>{s.date}</time></div>
          <div className="text-lg font-semibold mt-1 text-gray-800">{s.title}</div>
          <p className="text-sm text-gray-600 mt-3 leading-relaxed">{s.text}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onAccept(s.id)}
            className="px-4 py-2 rounded-lg bg-green-100 text-green-800 font-semibold text-sm hover:bg-green-200 transition"
          >
            Accept
          </button>
          <button
            onClick={() => onDiscuss(s.id)}
            className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-800 font-semibold text-sm hover:bg-indigo-200 transition"
          >
            Discuss
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewSuggestions() {
  const [suggestions, setSuggestions] = useState([
    { id: 11, teacher: 'Ms. Jain', date: '2025-09-10', title: 'Reduce concurrent labs', text: 'Request to not schedule two labs for same year' },
  { id: 12, teacher: 'Ms. Poonam Dabas', date: '2025-09-10', title: 'Reduce concurrent labs', text: 'Request to not schedule two labs for same year' }  
  ]);

  function accept(id) {
    setSuggestions(prev => prev.filter(p => p.id !== id));
    alert('Accepted (mock)');
  }

  function discuss(id) {
    alert('Open discussion modal for ' + id);
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <h3 className="text-3xl font-extrabold text-gray-900 mb-8 border-b-2 border-indigo-600 pb-3">
        Review Suggestions
      </h3>
      {suggestions.length === 0 ? (
        <div className="text-center text-gray-400 italic text-lg">No suggestions</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {suggestions.map(s => (
            <SuggestionCard key={s.id} s={s} onAccept={accept} onDiscuss={discuss} />
          ))}
        </div>
      )}
    </div>
  );
}
